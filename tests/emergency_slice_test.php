<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/src/config/database.php';
require_once __DIR__ . '/../public/src/features/auth/auth_service.php';
require_once __DIR__ . '/../public/src/features/emergency/emergency_service.php';
require_once __DIR__ . '/../public/src/lib/csrf.php';

/**
 * Slice 5 — Emergency SOS.
 *
 * Exercises the resident trigger, the staff paginated/filtered active board,
 * and the terminal dispatch lifecycle against the live emergency tables.
 */
class EmergencySliceTest {
    private PDO $pdo;
    private AuthService $authService;
    private EmergencyService $sos;
    private int $passed = 0;
    private int $failed = 0;

    private array $staff;
    private array $resident;

    public function __construct() {
        $this->pdo = Database::getConnection();
        $this->authService = $this->testableAuthService();
        $this->sos = new EmergencyService($this->pdo);
    }

    public function runAll(): void {
        echo "\n=== Running Slice 5: Emergency SOS Test Suite ===\n\n";

        $this->setupTestUsers();
        $seed = $this->testSosTriggered();
        $this->testSosVisibleOnActiveBoard($seed);
        $this->testActiveBoardPaginates();
        $this->testActiveBoardSearch($seed);

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

        $email = 'sos_' . time() . '@pembo.gov.ph';
        $this->authService->initiateRegistration($email, 'SecurePass123!', [
            'first_name' => 'SOS',
            'last_name' => 'Tester',
            'birthdate' => '1990-01-01',
            'gender' => 'Male',
            'civil_status' => 'Single',
            'street_address' => '9 Emergency St, Pembo',
        ]);
        $this->resident = $this->authService->verifyCode($email, $this->authService->lastCode);
    }

    /** @return array{id: string, sos_code: string} */
    private function testSosTriggered(): array {
        $alert = $this->sos->triggerSos(
            $this->resident['id'],
            'MEDICAL',
            14.5601,
            121.0632,
            18.5
        );
        $this->assert(!empty($alert['id']), 'SOS trigger returns an id');
        $this->assert(str_starts_with($alert['sos_code'], 'SOS-'), 'SOS code uses SOS- prefix');
        $this->assert($alert['status'] === 'TRIGGERED', 'New SOS starts as TRIGGERED');
        return ['id' => $alert['id'], 'sos_code' => $alert['sos_code']];
    }

    private function testSosVisibleOnActiveBoard(array $seed): void {
        $sheet = $this->sos->listActive(1, 50);
        $ids = array_column($sheet['data'] ?? [], 'id');
        $this->assert(isset($sheet['data'], $sheet['meta']), 'Paginated active board returns an envelope');
        $this->assert(in_array($seed['id'], $ids, true), 'Freshly triggered SOS appears on the active board');
    }

    private function testActiveBoardPaginates(): void {
        $one = $this->sos->listActive(1, 1);
        $this->assert(is_array($one['data'] ?? null) && count($one['data']) === 1, 'per_page=1 returns a single active SOS');
        $this->assert((int) $one['meta']['page'] === 1, 'Active board echoes requested page');

        $flat = $this->sos->listActive();
        $this->assert(is_array($flat) && !isset($flat['data']) && count($flat) >= 1, 'listActive() without paging returns legacy flat list');
    }

    private function testActiveBoardSearch(array $seed): void {
        // Unique SOS code must return exactly the seed row.
        $hit = $this->sos->listActive(1, 50, ['q' => $seed['sos_code']]);
        $ids = array_column($hit['data'] ?? [], 'id');
        $this->assert(count($ids) === 1 && $ids[0] === $seed['id'], 'q=sos code returns the seed alert exactly once');

        $miss = $this->sos->listActive(1, 50, ['q' => 'zz-no-such-sos-zz']);
        $this->assert((int) $miss['meta']['total'] === 0, 'q giberish returns an empty active board');
    }
}

$testRunner = new EmergencySliceTest();
$testRunner->runAll();
