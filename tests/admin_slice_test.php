<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/src/config/database.php';
require_once __DIR__ . '/../public/src/features/auth/auth_service.php';
require_once __DIR__ . '/../public/src/features/admin/admin_service.php';

class AdminSliceTest {
    private PDO $pdo;
    private AuthService $authService;
    private AdminService $adminService;
    private int $passed = 0;
    private int $failed = 0;
    private array $adminUser;

    public function __construct() {
        $this->pdo = Database::getConnection();
        $this->authService = new AuthService($this->pdo);
        $this->adminService = new AdminService($this->pdo);
    }

    public function runAll(): void {
        echo "\n=== Running Admin Slice Test Suite ===\n\n";

        $this->setupAdminUser();
        $this->testListAuditLogs();
        $this->testListStaffUsers();
        $this->testCreateStaffUserSuccess();
        $this->testCreateStaffUserDuplicateEmailRejected();
        $this->testCreateStaffUserShortPasswordRejected();
        $this->testToggleStaffStatus();
        $this->testGetAdminOverviewMetrics();
        $this->testAssetOverseerModule();
        $this->testStatisticalReportsModule();
        $this->testSystemSettingsModule();

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

    private function setupAdminUser(): void {
        $this->adminUser = $this->authService->login('admin@pembo.gov.ph', 'Admin12345!');
    }

    private function testListAuditLogs(): void {
        $logs = $this->adminService->listAuditLogs(10, 0);
        $this->assert(is_array($logs), "listAuditLogs returns an array");
        $this->assert(!empty($logs), "listAuditLogs returns non-empty audit entries");
        $first = $logs[0];
        $this->assert(isset($first['action']) && isset($first['table_name']), "Audit log record contains action and table_name");
    }

    private function testListStaffUsers(): void {
        $staff = $this->adminService->listStaffUsers();
        $this->assert(is_array($staff), "listStaffUsers returns an array");
        $this->assert(!empty($staff), "listStaffUsers includes seeded staff account");
        $first = $staff[0];
        $this->assert(isset($first['department']) && isset($first['position']), "Staff record includes department and position");
    }

    private function testCreateStaffUserSuccess(): void {
        $uniqueEmail = 'new_staff_' . time() . '_' . rand(100, 999) . '@pembo.gov.ph';
        $created = $this->adminService->createStaffUser(
            $uniqueEmail,
            'StaffPass123!',
            'TestFirst',
            'TestLast',
            'Records & Verification',
            'Desk Officer',
            $this->adminUser['id']
        );

        $this->assert($created['email'] === $uniqueEmail, "Created staff user returns correct email");
        $this->assert($created['department'] === 'Records & Verification', "Created staff profile retains department");

        // Verify login works for the newly created staff user
        $loginRes = $this->authService->login($uniqueEmail, 'StaffPass123!');
        $this->assert($loginRes['role_name'] === 'STAFF', "Newly created account has STAFF role");

        // Verify audit log entry was generated
        $stmtAudit = $this->pdo->prepare("SELECT action FROM audit_logs WHERE record_id = :rid AND action = 'CREATE_STAFF_ACCOUNT'");
        $stmtAudit->execute([':rid' => $created['user_id']]);
        $audit = $stmtAudit->fetch();
        $this->assert(!empty($audit), "Staff creation generates a CREATE_STAFF_ACCOUNT audit log entry");
    }

    private function testCreateStaffUserDuplicateEmailRejected(): void {
        $email = 'admin@pembo.gov.ph'; // Already registered email
        $rejected = false;
        try {
            $this->adminService->createStaffUser(
                $email,
                'StaffPass123!',
                'Dup',
                'Staff',
                'IT',
                'Officer',
                $this->adminUser['id']
            );
        } catch (InvalidArgumentException $e) {
            $rejected = true;
        }
        $this->assert($rejected, "Staff creation rejects duplicate email address");
    }

    private function testCreateStaffUserShortPasswordRejected(): void {
        $email = 'short_staff_' . time() . '@pembo.gov.ph';
        $rejected = false;
        try {
            $this->adminService->createStaffUser(
                $email,
                '1234',
                'Short',
                'Pass',
                'IT',
                'Officer',
                $this->adminUser['id']
            );
        } catch (InvalidArgumentException $e) {
            $rejected = true;
        }
        $this->assert($rejected, "Staff creation rejects password shorter than 8 characters");
    }

    private function testToggleStaffStatus(): void {
        $staff = $this->adminService->listStaffUsers();
        $this->assert(!empty($staff), "Staff list non-empty for toggle test");
        $target = $staff[0];

        // Deactivate staff
        $deactivated = $this->adminService->toggleStaffStatus($target['user_id'], false, $this->adminUser['id']);
        $this->assert($deactivated['is_active'] === 0, "Staff status toggled to inactive");

        // Reactivate staff
        $reactivated = $this->adminService->toggleStaffStatus($target['user_id'], true, $this->adminUser['id']);
        $this->assert($reactivated['is_active'] === 1, "Staff status toggled to active");
    }

    private function testGetAdminOverviewMetrics(): void {
        $metrics = $this->adminService->getAdminOverviewMetrics();
        $this->assert(isset($metrics['total_staff']) && $metrics['total_staff'] >= 1, "Admin overview metrics includes total_staff count");
        $this->assert(isset($metrics['active_staff']), "Admin overview metrics includes active_staff count");
        $this->assert(isset($metrics['total_residents']), "Admin overview metrics includes total_residents count");
        $this->assert(isset($metrics['total_audit_logs']), "Admin overview metrics includes total_audit_logs count");
    }

    private function testAssetOverseerModule(): void {
        $asset = $this->adminService->createAsset(
            'Emergency Relief Shelter Tent',
            'Relief Equipment',
            5,
            'Hall Warehouse Zone A',
            'NEW',
            $this->adminUser['id']
        );

        $this->assert(preg_match('/^AST-\d+$/', $asset['asset_tag']) === 1, "Asset creation generates an automatic AST-#### tag");
        $this->assert($asset['available_quantity'] === 5, "Initial available quantity equals total quantity");

        $list = $this->adminService->listAssets();
        $this->assert(is_array($list) && !empty($list), "listAssets returns non-empty catalog array");

        // Issue asset
        $tx = $this->adminService->issueAsset(
            $asset['id'],
            'Juan Dela Cruz',
            '09171112233',
            2,
            date('Y-m-d', strtotime('+3 days')),
            $this->adminUser['id'],
            'Barangay outreach event'
        );
        $this->assert($tx['quantity_borrowed'] === 2, "Asset issuance logs correct quantity borrowed");

        // Verify available quantity decreased
        $listAfterIssue = $this->adminService->listAssets();
        $issuedItem = array_values(array_filter($listAfterIssue, fn($a) => $a['id'] === $asset['id']))[0] ?? null;
        $this->assert($issuedItem !== null && (int)$issuedItem['available_quantity'] === 3, "Available stock decreased to 3 after issuing 2 items");

        // Return asset
        $ret = $this->adminService->returnAsset($tx['transaction_id'], 'RETURNED_COMPLETE', $this->adminUser['id'], 'Returned in good condition');
        $this->assert($ret['status'] === 'RETURNED_COMPLETE', "Asset return status updated to RETURNED_COMPLETE");

        $listAfterReturn = $this->adminService->listAssets();
        $returnedItem = array_values(array_filter($listAfterReturn, fn($a) => $a['id'] === $asset['id']))[0] ?? null;
        $this->assert($returnedItem !== null && (int)$returnedItem['available_quantity'] === 5, "Available stock restored to 5 after return");
    }

    private function testStatisticalReportsModule(): void {
        $daily = $this->adminService->generateStatisticalReport('daily');
        $this->assert($daily['period'] === 'daily', "Statistical report period set to daily");
        $this->assert(isset($daily['documents']['total']), "Daily report contains documents stats");
        $this->assert(isset($daily['appointments']['total']), "Daily report contains appointments stats");
        $this->assert(isset($daily['complaints']['total']), "Daily report contains complaints stats");
        $this->assert(isset($daily['residents']['total_registered']), "Daily report contains resident stats");

        $weekly = $this->adminService->generateStatisticalReport('weekly');
        $this->assert($weekly['period'] === 'weekly', "Statistical report period set to weekly");

        $monthly = $this->adminService->generateStatisticalReport('monthly');
        $this->assert($monthly['period'] === 'monthly', "Statistical report period set to monthly");
    }

    private function testSystemSettingsModule(): void {
        $settings = $this->adminService->getSystemSettings();
        $this->assert(is_array($settings), "getSystemSettings returns an array");

        $upd = $this->adminService->updateSystemSettings([
            'office_hours' => 'Mon-Sat 8:00 AM - 6:00 PM',
            'test_setting' => 'ActiveValue',
        ], $this->adminUser['id']);

        $this->assert($upd['test_setting'] === 'ActiveValue', "updateSystemSettings returns updated values");

        $settingsAfter = $this->adminService->getSystemSettings();
        $this->assert(isset($settingsAfter['test_setting']) && $settingsAfter['test_setting']['value'] === 'ActiveValue', "System setting persisted and retrieved successfully");
    }
}

$test = new AdminSliceTest();
$test->runAll();

