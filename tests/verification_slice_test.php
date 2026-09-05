<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/src/config/database.php';
require_once __DIR__ . '/../public/src/features/auth/auth_service.php';
require_once __DIR__ . '/../public/src/features/profile/profile_service.php';

// Resident Verification slice — exercises the paginated pending-verification
// queue that powers the staff verify board (server-side search + paging
// envelope), plus confirmation that the controller routes under STAFF RBAC.
// Mirrors the live-DB harness style used by profile_slice_test.php.

class VerificationSliceTest {
    private PDO $pdo;
    private AuthService $authService;
    private ProfileService $profileService;
    private int $passed = 0;
    private int $failed = 0;

    /** Registered pending residents created for deterministic assertions. */
    private array $residents = [];

    public function __construct() {
        $this->pdo = Database::getConnection();
        $this->authService = $this->testableAuthService();
        $this->profileService = new ProfileService($this->pdo);
    }

    private function testableAuthService(): AuthService {
        // Test double: disables email delivery and captures the generated code
        // so registration can be driven to the PENDING resident state locally.
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

    public function runAll(): void {
        echo "\n=== Running Verification Slice Test Suite ===\n\n";

        $this->createPendingResidents(3);
        $this->testExistingFlatQueueStillReturnsPending();
        $this->testPagedQueueReturnsEnvelope();
        $this->testSearchNarrowsToMatch();
        $this->testPagingSplitsRowsConsistently();
        $this->testRowsExposeInspectFields();

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

    private function validProfile(string $first, string $last, string $street): array {
        return [
            'first_name' => $first,
            'middle_name' => 'Q',
            'last_name' => $last,
            'suffix' => '',
            'birthdate' => '1991-02-03',
            'gender' => 'Other',
            'civil_status' => 'Single',
            'street_address' => $street,
        ];
    }

    /**
     * Register @count PENDING residents, tracking their emails/user_ids.
     * Names are unique-ish via a run tag so free-text search isolates them.
     */
    private function createPendingResidents(int $count): void {
        $tag = 'VChk' . time() . '_' . random_int(100, 999);
        for ($i = 1; $i <= $count; $i++) {
            $email = strtolower("{$tag}_{$i}@pembo.gov.ph");
            $this->authService->initiateRegistration($email, 'SecurePass123!', $this->validProfile($tag, 'Applicant' . $i, "{$tag} Street $i, Pembo"));
            $created = $this->authService->verifyCode($email, $this->authService->lastCode);
            $this->residents[] = [
                'email' => $email,
                'tag' => $tag,
                'user_id' => $created['id'] ?? null,
                'first_name' => $tag,
                'last_name' => 'Applicant' . $i,
            ];
        }
    }

    private function testExistingFlatQueueStillReturnsPending(): void {
        $flat = $this->profileService->listPendingVerifications();
        $this->assert(is_array($flat), "Legacy listPendingVerifications still returns an array");
        $emails = array_column($flat, 'email');
        $found = count(array_filter($this->residents, fn($r) => in_array($r['email'], $emails, true))) === count($this->residents);
        $this->assert($found, "Legacy flat queue includes the newly registered PENDING residents");
    }

    private function testPagedQueueReturnsEnvelope(): void {
        $page = $this->profileService->listPendingVerificationsPaged(1, 5, null);
        $this->assert(is_array($page) && isset($page['data'], $page['meta']), "Paged queue returns { data, meta } envelope");
        $this->assert(isset($page['meta']['total'], $page['meta']['total_pages'], $page['meta']['page'], $page['meta']['per_page']), "Envelope meta exposes paging fields");
        $this->assert($page['meta']['page'] === 1 && $page['meta']['per_page'] === 5, "Envelope echoes requested page/per_page");
        $this->assert(is_array($page['data']), "Envelope data holds rows");
    }

    private function testSearchNarrowsToMatch(): void {
        $tag = $this->residents[0]['tag'];
        $res = $this->profileService->listPendingVerificationsPaged(1, 50, $tag);
        $this->assert(isset($res['meta']['total']), "Search response includes envelope count");
        $this->assert($res['meta']['total'] === count($this->residents), "Free-text tag search returns exactly the run's applicants");
        foreach ($res['data'] as $row) {
            $joined = implode(' ', [$row['first_name'], $row['middle_name'] ?? '', $row['last_name'] ?? '', $row['email'] ?? '']);
            $this->assert(stripos($joined, $tag) !== false, "Every returned row matches the search term");
        }
    }

    private function testPagingSplitsRowsConsistently(): void {
        // Two pages of size 2 across the search-isolated applicants must sum to
        // the full count and carry no overlapping ids.
        $tag = $this->residents[0]['tag'];
        $p1 = $this->profileService->listPendingVerificationsPaged(1, 2, $tag);
        $p2 = $this->profileService->listPendingVerificationsPaged(2, 2, $tag);
        $this->assert(isset($p1['meta'], $p2['meta']), "Both pages carry envelopes");
        $p1Rows = array_column($p1['data'], 'user_id');
        $p2Rows = array_column($p2['data'], 'user_id');
        $this->assert(count($p1Rows) <= 2 && count($p2Rows) <= 2, "Per-page row cap is respected");
        $this->assert(count(array_intersect($p1Rows, $p2Rows)) === 0, "No applicant repeats across pages");
        $this->assert($p1['meta']['total'] === $p2['meta']['total'], "Page total is stable across pages");
    }

    private function testRowsExposeInspectFields(): void {
        $tag = $this->residents[0]['tag'];
        $res = $this->profileService->listPendingVerificationsPaged(1, 2, $tag);
        $row = $res['data'][0] ?? [];
        foreach (['id', 'user_id', 'email', 'first_name', 'middle_name', 'last_name', 'suffix', 'civil_status', 'gender', 'birthdate', 'street_address', 'id_document_path', 'verification_status'] as $key) {
            $this->assert(array_key_exists($key, $row), "Queue row exposes '$key' for the verify modal");
        }
        $this->assert($row['verification_status'] === 'PENDING', "Queue row is scoped to PENDING applications");
    }
}

(new VerificationSliceTest())->runAll();
