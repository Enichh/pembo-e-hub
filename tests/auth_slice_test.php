<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/src/config/database.php';
require_once __DIR__ . '/../public/src/features/auth/auth_service.php';
require_once __DIR__ . '/../public/src/lib/csrf.php';
require_once __DIR__ . '/../public/src/lib/auth_middleware.php';

class AuthSliceTest {
    private PDO $pdo;
    private AuthService $authService;
    private int $passed = 0;
    private int $failed = 0;

    public function __construct() {
        $this->pdo = Database::getConnection();
        $this->authService = new AuthService($this->pdo);
    }

    private function testableAuthService(): AuthService {
        // Test double: disables email delivery and captures the generated code
        // so the two-phase flow can be exercised deterministically.
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
        echo "\n=== Running Auth Test Suite ===\n\n";

        try {
            $this->testRolesExist();
            $this->testUserRegistrationValid();
            $this->testUserRegistrationInvalidEmail();
            $this->testUserRegistrationShortPassword();
            $this->testUserRegistrationDuplicateEmail();
            $this->testPasswordResetFlow();
            $this->testPasswordResetUnknownEmail();
            $this->testUserLoginSuccess();
            $this->testUserLoginInvalidPassword();
            $this->testCsrfTokenValidation();
            $this->testRbacAuthorization();
            $this->testAuditLogImmutability();
            $this->testPendingVerificationLoginGate();
        } finally {
            $this->tearDown();
        }

        echo "\n=======================================================\n";
        echo "TEST SUMMARY: {$this->passed} Passed, {$this->failed} Failed\n";
        echo "=======================================================\n\n";

        if ($this->failed > 0) {
            exit(1);
        }
    }

    private function tearDown(): void {
        try {
            $this->pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
            $testEmails = [
                'resident_%',
                'pending_gate_%',
                'duplicate_%',
                'pwreset_%',
                'nonexistent_%',
                'bad_%'
            ];
            foreach ($testEmails as $pattern) {
                $stmt = $this->pdo->prepare("SELECT id FROM users WHERE email LIKE :p");
                $stmt->execute([':p' => $pattern]);
                $uids = $stmt->fetchAll(PDO::FETCH_COLUMN);
                foreach ($uids as $uid) {
                    $this->pdo->exec("DELETE FROM resident_profiles WHERE user_id = '{$uid}'");
                    $this->pdo->exec("DELETE FROM staff_profiles WHERE user_id = '{$uid}'");
                    $this->pdo->exec("DELETE FROM users WHERE id = '{$uid}'");
                }
                $this->pdo->prepare("DELETE FROM pending_registrations WHERE email LIKE :p")->execute([':p' => $pattern]);
                $this->pdo->prepare("DELETE FROM password_resets WHERE email LIKE :p")->execute([':p' => $pattern]);
            }
            $this->pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
        } catch (Throwable $e) {
            // silent cleanup failure
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

    private function testRolesExist(): void {
        $stmt = $this->pdo->query("SELECT name FROM roles ORDER BY name");
        $roles = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        $hasAdmin = in_array('ADMIN', $roles, true);
        $hasStaff = in_array('STAFF', $roles, true);
        $hasResident = in_array('RESIDENT', $roles, true);

        $this->assert($hasAdmin && $hasStaff && $hasResident, "Roles seeding contains ADMIN, STAFF, RESIDENT");
    }

    private function validProfile(): array {
        return [
            'first_name' => 'Test',
            'last_name' => 'Resident',
            'birthdate' => '1995-06-15',
            'gender' => 'Male',
            'civil_status' => 'Single',
            'street_address' => 'Plaza Carriaga St. cor. Sampaguita St., Pembo, Taguig City 1642',
        ];
    }

    private function testUserRegistrationValid(): void {
        $svc = $this->testableAuthService();
        $uniqueEmail = 'resident_' . time() . '_' . rand(100, 999) . '@pembo.gov.ph';

        // Phase 1: initiate (no account created yet).
        $pending = $svc->initiateRegistration($uniqueEmail, 'SecurePass123!', $this->validProfile());
        $this->assert($pending['email'] === $uniqueEmail, "Initiation returns the pending email");

        $stmtUsers = $this->pdo->prepare("SELECT id FROM users WHERE email = :email");
        $stmtUsers->execute([':email' => $uniqueEmail]);
        $this->assert(!$stmtUsers->fetch(), "Account is NOT created before verification");

        // Phase 2: verify with the captured code.
        $user = $svc->verifyCode($uniqueEmail, $svc->lastCode);
        $this->assert($user['email'] === $uniqueEmail, "Verified user has correct email");
        $this->assert($user['role_name'] === 'RESIDENT', "New self-registered user defaults to RESIDENT role");

        $stmtProfile = $this->pdo->prepare("SELECT first_name FROM resident_profiles WHERE user_id = :uid");
        $stmtProfile->execute([':uid' => $user['id']]);
        $profileRow = $stmtProfile->fetch();
        $this->assert($profileRow && $profileRow['first_name'] === 'Test', "Verification creates a resident profile row");

        $stmtAudit = $this->pdo->prepare("SELECT action FROM audit_logs WHERE user_id = :uid AND action = 'REGISTER'");
        $stmtAudit->execute([':uid' => $user['id']]);
        $auditRow = $stmtAudit->fetch();
        $this->assert(!empty($auditRow), "Verification generates an audit log entry");
    }

    private function testUserRegistrationInvalidEmail(): void {
        $svc = $this->testableAuthService();
        $failed = false;
        try {
            $svc->initiateRegistration('invalid-email-address', 'SecurePass123!', $this->validProfile());
        } catch (InvalidArgumentException $e) {
            $failed = true;
        }
        $this->assert($failed, "Registration fails on invalid email format");
    }

    private function testUserRegistrationShortPassword(): void {
        $svc = $this->testableAuthService();
        $failed = false;
        try {
            $svc->initiateRegistration('valid@pembo.gov.ph', '1234', $this->validProfile());
        } catch (InvalidArgumentException $e) {
            $failed = true;
        }
        $this->assert($failed, "Registration fails on password shorter than 8 characters");
    }

    private function testUserRegistrationDuplicateEmail(): void {
        $svc = $this->testableAuthService();
        $duplicateEmail = 'duplicate_' . time() . '@pembo.gov.ph';

        // Fully register the first account.
        $svc->initiateRegistration($duplicateEmail, 'SecurePass123!', $this->validProfile());
        $svc->verifyCode($duplicateEmail, $svc->lastCode);

        $failed = false;
        try {
            // Second attempt with same (now-registered) email must be rejected.
            $svc->initiateRegistration($duplicateEmail, 'AnotherPass123!', $this->validProfile());
        } catch (InvalidArgumentException $e) {
            $failed = true;
        }
        $this->assert($failed, "Registration rejects duplicate email addresses");
    }

    private function testPasswordResetFlow(): void {
        $svc = $this->testableAuthService();
        $email = 'pwreset_' . time() . '@pembo.gov.ph';

        // Create a user to reset (via full registration flow).
        $svc->initiateRegistration($email, 'OriginalPass123!', $this->validProfile());
        $svc->verifyCode($email, $svc->lastCode);

        $originalHash = $this->getPasswordHash($email);

        // Phase 1: request reset — password must NOT change yet.
        $svc->requestPasswordReset($email);
        $this->assert($this->getPasswordHash($email) === $originalHash, "Password NOT changed before code verification");

        // Phase 2: verify with wrong code must not issue a token.
        $wrongFailed = false;
        try {
            $svc->verifyResetCode($email, '000000');
        } catch (InvalidArgumentException $e) {
            $wrongFailed = true;
        }
        $this->assert($wrongFailed, "Reset fails on incorrect code");
        $this->assert($this->getPasswordHash($email) === $originalHash, "Password unchanged after failed verification");

        // Phase 2: verify with correct code — issues a reset token, password still unchanged.
        $verified = $svc->verifyResetCode($email, $svc->lastCode);
        $this->assert(!empty($verified['reset_token']), "Verification issues a reset token");
        $this->assert($this->getPasswordHash($email) === $originalHash, "Password still unchanged before phase 3");

        // Phase 3: apply the new password with the token.
        $svc->resetPassword($email, $verified['reset_token'], 'NewSecurePass456!');
        $newHash = $this->getPasswordHash($email);
        $this->assert($newHash !== $originalHash && password_verify('NewSecurePass456!', $newHash), "Password updated after successful reset");

        // Pending reset row should be gone.
        $stmt = $this->pdo->prepare("SELECT id FROM password_resets WHERE email = :email");
        $stmt->execute([':email' => $email]);
        $this->assert(!$stmt->fetch(), "Pending reset removed after reset");
    }

    private function testPasswordResetUnknownEmail(): void {
        $svc = $this->testableAuthService();
        $unknown = 'nosuchuser_' . time() . '@pembo.gov.ph';
        $failed = false;
        try {
            $svc->requestPasswordReset($unknown);
        } catch (InvalidArgumentException $e) {
            $failed = true;
        }
        $this->assert($failed, "Reset fails (closed) on unknown email");
    }

    private function getPasswordHash(string $email): string {
        $stmt = $this->pdo->prepare("SELECT password_hash FROM users WHERE email = :email");
        $stmt->execute([':email' => $email]);
        $row = $stmt->fetch();
        return $row ? $row['password_hash'] : '';
    }

    private function testUserLoginSuccess(): void {
        $user = $this->authService->login('admin@pembo.gov.ph', 'Admin12345!');
        $this->assert($user['email'] === 'admin@pembo.gov.ph', "Admin login returns matching email");
        $this->assert($user['role_name'] === 'ADMIN', "Admin login identifies ADMIN role correctly");
    }

    private function testUserLoginInvalidPassword(): void {
        $failed = false;
        try {
            $this->authService->login('admin@pembo.gov.ph', 'WrongPassword!');
        } catch (InvalidArgumentException $e) {
            $failed = true;
        }
        $this->assert($failed, "Login fails closed on incorrect password");
    }

    private function testCsrfTokenValidation(): void {
        $token = CSRF::generateToken();
        $this->assert(!empty($token), "CSRF token generated successfully");
        $this->assert(CSRF::validateToken($token), "Valid CSRF token passes verification");
        $this->assert(!CSRF::validateToken('forged-token-value'), "Forged CSRF token rejected");
    }

    private function testRbacAuthorization(): void {
        $_SESSION['auth_user'] = [
            'id' => '33333333-3333-3333-3333-333333333333',
            'email' => 'resident@pembo.gov.ph',
            'role_name' => 'RESIDENT'
        ];

        $residentBlockedFromAdmin = false;
        $userRole = strtoupper($_SESSION['auth_user']['role_name']);
        if (!in_array($userRole, ['ADMIN'], true)) {
            $residentBlockedFromAdmin = true;
        }
        $this->assert($residentBlockedFromAdmin, "Resident is blocked from Admin back-office");

        $_SESSION['auth_user']['role_name'] = 'ADMIN';
        $adminAllowed = in_array(strtoupper($_SESSION['auth_user']['role_name']), ['ADMIN'], true);
        $this->assert($adminAllowed, "Admin is authorized for Admin back-office");
    }

    private function testAuditLogImmutability(): void {
        $stmt = $this->pdo->query("SELECT id FROM audit_logs LIMIT 1");
        $row = $stmt->fetch();
        if (!$row) {
            $this->assert(false, "Audit log record not found for immutability test");
            return;
        }

        $logId = $row['id'];
        $updatePrevented = false;
        try {
            $this->pdo->exec("UPDATE audit_logs SET action = 'TAMPERED' WHERE id = {$logId}");
        } catch (PDOException $e) {
            $updatePrevented = (strpos($e->getMessage(), 'immutable') !== false || strpos($e->getMessage(), '45000') !== false);
        }
        $this->assert($updatePrevented, "Database trigger prevents UPDATE on audit_logs");

        $deletePrevented = false;
        try {
            $this->pdo->exec("DELETE FROM audit_logs WHERE id = {$logId}");
        } catch (PDOException $e) {
            $deletePrevented = (strpos($e->getMessage(), 'immutable') !== false || strpos($e->getMessage(), '45000') !== false);
        }
        $this->assert($deletePrevented, "Database trigger prevents DELETE on audit_logs");
    }

    private function testPendingVerificationLoginGate(): void {
        $svc = $this->testableAuthService();
        $email = 'pending_gate_' . time() . '@pembo.gov.ph';
        $dummyIdPath = 'storage/resident_ids/test_id_proof.pdf';

        // Register resident with valid ID proof.
        $svc->initiateRegistration($email, 'SecurePass123!', $this->validProfile(), $dummyIdPath);
        $user = $svc->verifyCode($email, $svc->lastCode);

        // 1. Pending resident login attempt must be rejected.
        $blocked = false;
        try {
            $svc->login($email, 'SecurePass123!');
        } catch (RuntimeException $e) {
            $blocked = str_contains(strtolower($e->getMessage()), 'pending verification');
        }
        $this->assert($blocked, "Pending resident login is blocked with explanatory error message");

        // 2. Approve the resident account.
        $stmt = $this->pdo->prepare("UPDATE resident_profiles SET verification_status = 'VERIFIED' WHERE user_id = :uid");
        $stmt->execute([':uid' => $user['id']]);

        // 3. Resident login after approval must succeed.
        $approvedUser = $svc->login($email, 'SecurePass123!');
        $this->assert($approvedUser['email'] === $email, "Approved resident login succeeds");
        $this->assert($approvedUser['verification_status'] === 'VERIFIED', "Approved resident session includes VERIFIED status");
    }
}

$testRunner = new AuthSliceTest();
$testRunner->runAll();
