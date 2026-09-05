<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/src/config/database.php';
require_once __DIR__ . '/../public/src/features/auth/auth_service.php';
require_once __DIR__ . '/../public/src/features/profile/profile_service.php';
require_once __DIR__ . '/../public/src/lib/csrf.php';

// Profile slice — exercises reading and updating a resident's profile against
// the real resident_profiles table, including validation, IDOR-safe scoping,
// and audit logging on every write.

class ProfileSliceTest {
    private PDO $pdo;
    private AuthService $authService;
    private ProfileService $profileService;
    private int $passed = 0;
    private int $failed = 0;

    private array $resident;

    public function __construct() {
        $this->pdo = Database::getConnection();
        $this->authService = $this->testableAuthService();
        $this->profileService = new ProfileService($this->pdo);
    }

    private function testableAuthService(): AuthService {
        // Test double: disables email delivery and captures the generated code
        // (mirrors auth_slice_test.php) so registration can be completed.
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
        echo "\n=== Running Profile Slice Test Suite ===\n\n";

        $this->setupTestUser();
        $this->testProfileCreatedOnRegistration();
        $this->testGetProfileReturnsFullRow();
        $this->testGetProfileIsIdorSafe();
        $this->testUpdateProfilePersistsChanges();
        $this->testUpdateRejectsInvalidGender();
        $this->testUpdateRejectsFutureBirthdate();
        $this->testUpdateWritesAuditLog();
        $this->testVerificationQueueAndResidentDirectory();

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
        $email = 'profile_' . time() . '@pembo.gov.ph';
        $pending = $this->authService->initiateRegistration($email, 'SecurePass123!', $this->validProfile());
        // Reflect on the lastCode the service stored internally (mirrors the
        // test harness pattern used by auth_slice_test.php).
        $this->resident = $this->authService->verifyCode($email, $this->authService->lastCode);
    }

    private function validProfile(): array {
        return [
            'first_name' => 'Profile',
            'middle_name' => 'M',
            'last_name' => 'Tester',
            'suffix' => '',
            'birthdate' => '1990-01-01',
            'gender' => 'Male',
            'civil_status' => 'Single',
            'street_address' => '123 Test Street, Pembo',
        ];
    }

    private function testProfileCreatedOnRegistration(): void {
        $row = $this->profileService->getResidentProfile($this->resident['id']);
        $this->assert($row !== null, "getResidentProfile returns a row after registration");
        $this->assert($row['first_name'] === 'Profile', "Registered first name persisted");
        $this->assert($row['email'] === $this->resident['email'], "Profile joins back to the user email");
    }

    private function testGetProfileReturnsFullRow(): void {
        $row = $this->profileService->getResidentProfile($this->resident['id']);
        $this->assert(array_key_exists('contact_number', $row), "Profile includes contact_number field");
        $this->assert(array_key_exists('voter_status', $row), "Profile includes voter_status field");
        $this->assert(array_key_exists('birthdate', $row), "Profile includes birthdate field");
    }

    private function testGetProfileIsIdorSafe(): void {
        // A different, non-existent user id must yield null, not another user's row.
        $row = $this->profileService->getResidentProfile('00000000-0000-0000-0000-000000000000');
        $this->assert($row === null, "Unknown user id returns null (IDOR-safe)");
    }

    private function testUpdateProfilePersistsChanges(): void {
        $this->profileService->updateResidentProfile($this->resident['id'], [
            'first_name' => 'ProfileUpdated',
            'middle_name' => 'X',
            'last_name' => 'Tester',
            'suffix' => 'Jr',
            'birthdate' => '1990-01-01',
            'gender' => 'Male',
            'civil_status' => 'Married',
            'contact_number' => '09171234567',
            'street_address' => '456 New Street, Pembo',
            'voter_status' => 1,
        ]);

        $row = $this->profileService->getResidentProfile($this->resident['id']);
        $this->assert($row['first_name'] === 'ProfileUpdated', "First name updated");
        $this->assert($row['suffix'] === 'Jr', "Suffix updated");
        $this->assert($row['civil_status'] === 'Married', "Civil status updated");
        $this->assert($row['contact_number'] === '09171234567', "Contact number updated");
        $this->assert((int) $row['voter_status'] === 1, "Voter status updated to true");
    }

    private function testUpdateRejectsInvalidGender(): void {
        $blocked = false;
        try {
            $this->profileService->updateResidentProfile($this->resident['id'], [
                'first_name' => 'Profile',
                'middle_name' => '',
                'last_name' => 'Tester',
                'suffix' => '',
                'birthdate' => '1990-01-01',
                'gender' => 'Unicorn',
                'civil_status' => 'Single',
                'contact_number' => '',
                'street_address' => '123 Test Street',
                'voter_status' => 0,
            ]);
        } catch (InvalidArgumentException $e) {
            $blocked = true;
        }
        $this->assert($blocked, "Update rejects an invalid gender value");
    }

    private function testUpdateRejectsFutureBirthdate(): void {
        $blocked = false;
        try {
            $this->profileService->updateResidentProfile($this->resident['id'], [
                'first_name' => 'Profile',
                'middle_name' => '',
                'last_name' => 'Tester',
                'suffix' => '',
                'birthdate' => date('Y-m-d', strtotime('+1 year')),
                'gender' => 'Male',
                'civil_status' => 'Single',
                'contact_number' => '',
                'street_address' => '123 Test Street',
                'voter_status' => 0,
            ]);
        } catch (InvalidArgumentException $e) {
            $blocked = true;
        }
        $this->assert($blocked, "Update rejects a future birthdate");
    }

    private function testUpdateWritesAuditLog(): void {
        $this->profileService->updateResidentProfile($this->resident['id'], [
            'first_name' => 'Profile',
            'middle_name' => '',
            'last_name' => 'Tester',
            'suffix' => '',
            'birthdate' => '1990-01-01',
            'gender' => 'Male',
            'civil_status' => 'Single',
            'contact_number' => '',
            'street_address' => '123 Test Street',
            'voter_status' => 0,
        ]);

        $stmt = $this->pdo->prepare("SELECT action FROM audit_logs WHERE user_id = :uid AND action = 'UPDATE_PROFILE'");
        $stmt->execute([':uid' => $this->resident['id']]);
        $this->assert($stmt->fetch() !== false, "Profile update writes an audit log entry");
    }

    private function testVerificationQueueAndResidentDirectory(): void {
        // Get Admin user ID for verification.
        $stmtAdmin = $this->pdo->query("SELECT id FROM users WHERE role_id = 1 LIMIT 1");
        $adminUser = $stmtAdmin->fetch();
        $adminId = $adminUser ? $adminUser['id'] : null;

        // Register Resident 1 for verification.
        $email1 = 'verify_queue_1_' . time() . '@pembo.gov.ph';
        $pending1 = $this->authService->initiateRegistration($email1, 'SecurePass123!', [
            'first_name' => 'Verify',
            'last_name' => 'ResidentOne',
            'birthdate' => '1992-04-10',
            'gender' => 'Female',
            'civil_status' => 'Single',
            'street_address' => 'Sample Address 1, Pembo',
        ], 'storage/resident_ids/id1.pdf');
        $user1 = $this->authService->verifyCode($email1, $this->authService->lastCode);

        // 1. Verify Resident 1 is in pending queue.
        $pendingList = $this->profileService->listPendingVerifications();
        $found1 = false;
        foreach ($pendingList as $p) {
            if ($p['user_id'] === $user1['id']) {
                $found1 = true;
                break;
            }
        }
        $this->assert($found1, "Newly registered resident appears in pending verification queue");

        // 2. Approve Resident 1 account.
        $res1 = $this->profileService->verifyResidentAccount($user1['id'], 'VERIFIED', null, $adminId);
        $this->assert(is_array($res1) && $res1['verification_status'] === 'VERIFIED', "verifyResidentAccount returns updated payload on approval");

        $updatedProfile1 = $this->profileService->getResidentProfile($user1['id']);
        $this->assert($updatedProfile1['verification_status'] === 'VERIFIED', "Resident 1 verification status updated to VERIFIED");

        // 3. Register Resident 2 and Reject account.
        $email2 = 'verify_queue_2_' . time() . '@pembo.gov.ph';
        $this->authService->initiateRegistration($email2, 'SecurePass123!', [
            'first_name' => 'Reject',
            'last_name' => 'ResidentTwo',
            'birthdate' => '1988-08-20',
            'gender' => 'Male',
            'civil_status' => 'Married',
            'street_address' => 'Sample Address 2, Pembo',
        ], 'storage/resident_ids/id2.pdf');
        $user2 = $this->authService->verifyCode($email2, $this->authService->lastCode);

        $res2 = $this->profileService->verifyResidentAccount($user2['id'], 'REJECTED', 'Unreadable ID document', $adminId);
        $this->assert(is_array($res2) && $res2['verification_status'] === 'REJECTED', "verifyResidentAccount returns updated payload on rejection");

        $updatedProfile2 = $this->profileService->getResidentProfile($user2['id']);
        $this->assert($updatedProfile2['verification_status'] === 'REJECTED', "Resident 2 verification status updated to REJECTED");
        $this->assert($updatedProfile2['rejection_reason'] === 'Unreadable ID document', "Rejection reason saved");

        // 4. Test central resident directory listing.
        $directory = $this->profileService->listResidentDirectory();
        $this->assert(count($directory) >= 2, "Resident directory lists registered residents");

        // 5. Verify audit log entry.
        $stmtAudit = $this->pdo->prepare("SELECT action FROM audit_logs WHERE action = 'VERIFY_RESIDENT_ACCOUNT' AND record_id = :pid");
        $stmtAudit->execute([':pid' => $updatedProfile1['id']]);
        $this->assert($stmtAudit->fetch() !== false, "Verification decision logs audit entry");
    }
}

$testRunner = new ProfileSliceTest();
$testRunner->runAll();
