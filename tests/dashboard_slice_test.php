<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/src/config/database.php';
require_once __DIR__ . '/../public/src/features/auth/auth_service.php';
require_once __DIR__ . '/../public/src/features/dashboard/dashboard_service.php';

class DashboardSliceTest {
    private PDO $pdo;
    private AuthService $authService;
    private DashboardService $dashboardService;
    private int $passed = 0;
    private int $failed = 0;
    private array $residentUser;

    public function __construct() {
        $this->pdo = Database::getConnection();
        $this->authService = new AuthService($this->pdo);
        $this->dashboardService = new DashboardService($this->pdo);
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

    public function runAll(): void {
        echo "\n=== Running Dashboard Slice Test Suite ===\n\n";

        $this->setupTestUser();
        $this->testResidentSummaryStructure();
        $this->testStaffAdminSummaryStructure();

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

    private function setupTestUser(): void {
        $email = 'dash_user_' . time() . '@pembo.gov.ph';
        $testableAuth = $this->testableAuthService();
        $testableAuth->initiateRegistration($email, 'Resident12345!', [
            'first_name' => 'Dashboard',
            'last_name'  => 'Tester',
            'birthdate'  => '1995-05-05',
            'gender'     => 'Male',
            'civil_status' => 'Single',
            'street_address' => '123 Pembo St',
        ]);
        $this->residentUser = $testableAuth->verifyCode($email, $testableAuth->lastCode);
    }

    private function testResidentSummaryStructure(): void {
        $summary = $this->dashboardService->getResidentSummary($this->residentUser['id']);
        
        $this->assert(isset($summary['pending_documents']), "Resident summary includes pending_documents");
        $this->assert(isset($summary['total_documents']), "Resident summary includes total_documents");
        $this->assert(isset($summary['upcoming_appointments']), "Resident summary includes upcoming_appointments");
        $this->assert(isset($summary['active_complaints']), "Resident summary includes active_complaints");
        $this->assert(is_int($summary['pending_documents']), "Pending documents count is integer");
    }

    private function testStaffAdminSummaryStructure(): void {
        $summary = $this->dashboardService->getStaffAdminSummary();

        $this->assert(isset($summary['pending_documents_queue']), "Staff/Admin summary includes pending_documents_queue");
        $this->assert(isset($summary['today_appointments']), "Staff/Admin summary includes today_appointments");
        $this->assert(isset($summary['active_complaints_queue']), "Staff/Admin summary includes active_complaints_queue");
        $this->assert(isset($summary['active_emergency_sos']), "Staff/Admin summary includes active_emergency_sos");
        $this->assert(is_int($summary['pending_documents_queue']), "Pending documents queue count is integer");
    }
}

$test = new DashboardSliceTest();
$test->runAll();
