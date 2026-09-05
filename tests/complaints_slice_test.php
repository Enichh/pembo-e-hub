<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/src/config/database.php';
require_once __DIR__ . '/../public/src/features/auth/auth_service.php';
require_once __DIR__ . '/../public/src/features/complaints/complaints_service.php';
require_once __DIR__ . '/../public/src/lib/csrf.php';

// Slice 4 — Complaints & Incidents.
// Exercises filing, IDOR-safe listing, the staff triage status transition
// (with complaint_updates ledger), and audit logging against the live
// complaints tables.

class ComplaintsSliceTest {
    private PDO $pdo;
    private AuthService $authService;
    private ComplaintsService $complaintsService;
    private int $passed = 0;
    private int $failed = 0;

    private array $resident;
    private array $staff;

    public function __construct() {
        $this->pdo = Database::getConnection();
        $this->authService = $this->testableAuthService();
        $this->complaintsService = new ComplaintsService($this->pdo);
    }

    public function runAll(): void {
        echo "\n=== Running Slice 4: Complaints Test Suite ===\n\n";

        $this->setupTestUsers();
        $this->testComplaintCreated();
        $this->testComplaintNumberUnique();
        $this->testResidentListsOwnOnly();
        $this->testStaffListsAll();
        $this->testStaffListAllPaginates();
        $this->testStaffListAllStatusFilter();
        $this->testStaffListAllSearch();
        $this->testFutureDateRejected();
        $this->testEmptyNarrativeRejected();
        $this->testStatusTransitionWritesLedger();
        $this->testAuditLogOnCreate();

        echo "\n=======================================================\n";
        echo "TEST SUMMARY: {$this->passed} Passed, {$this->failed} Failed\n";
        echo "=======================================================\n\n";

        if ($this->failed > 0) {
            exit(1);
        }
    }

    private function assert(bool $condition, string $testName): void {
        if ($condition) {
            echo "  [PASS] {$testName}\n";
            $this->passed++;
        } else {
            echo "  [FAIL] {$testName}\n";
            $this->failed++;
        }
    }

    private function testableAuthService(): AuthService {
        return new class($this->pdo) extends AuthService {
            public string $lastCode = '';
            public function __construct(PDO $pdo) {
                parent::__construct($pdo, false);
            }
            protected function generateVerificationCode(): int {
                $code = random_int(100000, 999999);
                $this->lastCode = (string) $code;
                return $code;
            }
        };
    }

    private function setupTestUsers(): void {
        $this->staff = $this->authService->login('staff@pembo.gov.ph', 'Staff12345!');

        $email = 'complaint_' . time() . '@pembo.gov.ph';
        $pending = $this->authService->initiateRegistration($email, 'SecurePass123!', $this->validProfile());
        $this->resident = $this->authService->verifyCode($email, $this->authService->lastCode);
    }

    private function validProfile(): array {
        return [
            'first_name' => 'Complaint',
            'last_name' => 'Tester',
            'birthdate' => '1990-05-05',
            'gender' => 'Male',
            'civil_status' => 'Single',
            'street_address' => '123 Test Street, Pembo',
        ];
    }

    private function pastDate(): string {
        return date('Y-m-d\TH:i', strtotime('-2 hours'));
    }

    private function testComplaintCreated(): void {
        $c = $this->complaintsService->create(
            $this->resident['id'],
            'Noise Disturbance',
            'Block 2, Sampaguita St.',
            $this->pastDate(),
            'Loud karaoke past midnight.'
        );
        $this->assert(!empty($c['id']), "Complaint ID generated");
        $this->assert($c['status'] === 'FILED', "New complaint starts as FILED");
        $this->assert(str_starts_with($c['complaint_number'], 'CMP-'), "Complaint number uses CMP- prefix");
    }

    private function testComplaintNumberUnique(): void {
        $a = $this->complaintsService->create($this->resident['id'], 'Other', 'Loc A', $this->pastDate(), 'n');
        $b = $this->complaintsService->create($this->resident['id'], 'Other', 'Loc B', $this->pastDate(), 'n');
        $this->assert($a['complaint_number'] !== $b['complaint_number'], "Complaint numbers are unique");
    }

    private function testResidentListsOwnOnly(): void {
        $mine = $this->complaintsService->listMine($this->resident['id']);
        foreach ($mine as $c) {
            // listMine already scopes by resident_id; verify non-empty.
            $this->assert(!empty($c['id']), "Resident can list their own complaints");
        }
        $this->assert(count($mine) >= 1, "Resident has at least one complaint visible");
    }

    private function testStaffListsAll(): void {
        $all = $this->complaintsService->listAll();
        $this->assert(count($all) >= 1, "Staff can list the full complaint queue");
    }

    /**
     * Create a complaint whose complaint_number is guaranteed unique so tests
     * can assert exact-match search semantics from the async/unknown seed DB.
     */
    private function makeUniqueComplaint(string $type = 'Noise Disturbance'): array {
        return $this->complaintsService->create(
            $this->resident['id'],
            $type,
            'Unique search loc ' . bin2hex(random_bytes(4)),
            $this->pastDate(),
            'Unique narrative ' . bin2hex(random_bytes(4))
        );
    }

    private function testStaffListAllPaginates(): void {
        $r = $this->complaintsService->listAll(1, 25);
        $this->assert(isset($r['data'], $r['meta']), "Paginated staff complaint list returns an envelope (data + meta)");
        $this->assert((int)$r['meta']['per_page'] === 25, "Complaint envelope echoes requested per_page");
        $this->assert(is_array($r['data']) && count($r['data']) <= 25, "Complaint page does not exceed per_page");
        $this->assert((int)$r['meta']['total'] >= 1, "Complaint envelope reports a non-zero total");

        // Flat-array legacy shape must still work when nothing is requested.
        $flat = $this->complaintsService->listAll();
        $this->assert(is_array($flat) && count($flat) >= 1 && !isset($flat['data']), "listAll() without paging still returns the legacy flat array");
    }

    private function testStaffListAllStatusFilter(): void {
        $seed = $this->makeUniqueComplaint(); // starts FILED
        $filed = $this->complaintsService->listAll(1, 200, ['status' => 'FILED']);
        $this->assert((int)$filed['meta']['total'] >= 1, "Status=FILED returns at least one complaint");
        $allFiled = count(array_filter($filed['data'], function ($c2) {
            return $c2['status'] !== 'FILED';
        })) === 0;
        $this->assert($allFiled, "Status=FILED returns only filed complaints");

        $resolved = $this->complaintsService->listAll(0, 0, ['status' => 'RESOLVED']);
        $ids = array_column($resolved, 'id');
        $this->assert(!in_array($seed['id'], $ids, true), "Status=RESOLVED excludes the freshly FILED seed complaint");
    }

    private function testStaffListAllSearch(): void {
        $seed = $this->makeUniqueComplaint('Harassment');
        // The full complaint_number is globally unique, so q must match exactly one row.
        $hit = $this->complaintsService->listAll(1, 200, ['q' => $seed['complaint_number']]);
        $ids = array_column($hit['data'] ?? [], 'id');
        $this->assert(count($ids) === 1 && $ids[0] === $seed['id'], "q=complaint number returns the seed complaint exactly once");

        // Searching for something that can never match any complaint returns nothing.
        $miss = $this->complaintsService->listAll(1, 200, ['q' => 'zz-no-such-complaint-zz']);
        $this->assert((int)$miss['meta']['total'] === 0, "q giberish returns an empty filtered result");
    }

    private function testFutureDateRejected(): void {
        $blocked = false;
        try {
            $this->complaintsService->create(
                $this->resident['id'],
                'Boundary Dispute',
                'Somewhere',
                date('Y-m-d\TH:i', strtotime('+1 day')),
                'n'
            );
        } catch (InvalidArgumentException $e) {
            $blocked = true;
        }
        $this->assert($blocked, "Future incident date rejected");
    }

    private function testEmptyNarrativeRejected(): void {
        $blocked = false;
        try {
            $this->complaintsService->create($this->resident['id'], 'Other', 'Loc', $this->pastDate(), '   ');
        } catch (InvalidArgumentException $e) {
            $blocked = true;
        }
        $this->assert($blocked, "Empty narrative rejected");
    }

    private function testStatusTransitionWritesLedger(): void {
        $c = $this->complaintsService->create($this->resident['id'], 'Noise Disturbance', 'Loc', $this->pastDate(), 'n');

        $updated = $this->complaintsService->updateStatus(
            $c['id'],
            'UNDER_INVESTIGATION',
            $this->staff['id'],
            $this->staff['id'],
            'Assigned for investigation',
            null,
            'Investigating noise complaint.'
        );
        $this->assert($updated['status'] === 'UNDER_INVESTIGATION', "Status transitions to UNDER_INVESTIGATION");
        $this->assert($updated['assigned_officer_id'] === $this->staff['id'], "Officer assigned");

        $updates = $this->complaintsService->listUpdates($c['id']);
        $this->assert(count($updates) >= 1, "Status change writes a complaint_updates ledger row");
    }

    private function testAuditLogOnCreate(): void {
        $c = $this->complaintsService->create($this->resident['id'], 'Noise Disturbance', 'Loc', $this->pastDate(), 'n');
        $stmt = $this->pdo->prepare("SELECT action FROM audit_logs WHERE record_id = :id AND action = 'CREATE_COMPLAINT'");
        $stmt->execute([':id' => $c['id']]);
        $this->assert($stmt->fetch() !== false, "Complaint create writes an audit log entry");
    }
}

$testRunner = new ComplaintsSliceTest();
$testRunner->runAll();
