<?php

declare(strict_types=1);

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/logger.php';
require_once __DIR__ . '/../../lib/csrf.php';
require_once __DIR__ . '/../../lib/mailer.php';
require_once __DIR__ . '/../../lib/notification_service.php';

/**
 * Authentication and User Identity Service Slice
 *
 * Handles 2-phase registration, password reset flows, login authentication,
 * and session destruction with immutable security audit logging.
 *
 * @package PemboEHub\Features\Auth
 */
class AuthService {
    private PDO $pdo;
    private bool $sendEmails;
    private NotificationService $notifier;

    public function __construct(?PDO $pdo = null, bool $sendEmails = true, ?NotificationService $notifier = null) {
        $this->pdo = $pdo ?? Database::getConnection();
        $this->sendEmails = $sendEmails;
        $this->notifier = $notifier ?? new NotificationService($sendEmails ? null : false);
    }

    /**
     * Generate UUIDv4 string identifier.
     *
     * @return string 36-character UUID string.
     */
    public function generateUuid(): string {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    private const ALLOWED_GENDERS = ['Male', 'Female', 'Other'];
    private const ALLOWED_CIVIL_STATUS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];

    private const CODE_TTL_SECONDS = 600;          // 10 minutes
    private const CODE_MAX_VERIFY_ATTEMPTS = 5;

    /**
     * Phase 1: validate registration payload, generate a 6-digit verification code,
     * persist as PENDING registration, and email the code.
     *
     * @param string $email User email address.
     * @param string $password Cleartext password.
     * @param array<string, mixed> $profile Resident demographic fields.
     * @return array{pending_id: string, email: string} Pending registration handle.
     * @throws InvalidArgumentException On invalid format, age requirement failure, or duplicate email.
     */
    public function initiateRegistration(string $email, string $password, array $profile = [], ?string $idDocumentPath = null): array {

        $email = trim(filter_var($email, FILTER_SANITIZE_EMAIL));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException("Please provide a valid email address.");
        }

        if (strlen($password) < 8) {
            throw new InvalidArgumentException("Password must be at least 8 characters long.");
        }

        [$firstName, $middleName, $lastName, $suffix, $birthdate, $gender, $civilStatus, $streetAddress] = $this->validateProfile($profile);

        $stmtCheck = $this->pdo->prepare("SELECT id FROM users WHERE email = :email");
        $stmtCheck->execute([':email' => $email]);
        if ($stmtCheck->fetch()) {
            throw new InvalidArgumentException("Email is already registered. Please log in instead.");
        }

        // Ensure pending_registrations has id_document_path column safely
        $this->pdo->exec("ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS id_document_path VARCHAR(255) DEFAULT NULL");

        // Opportunistic cleanup of any expired pending rows
        $this->purgeExpiredPending();

        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        $code = $this->generateVerificationCode();
        $codeHash = password_hash((string) $code, PASSWORD_BCRYPT, ['cost' => 12]);
        $pendingId = $this->generateUuid();

        $this->pdo->beginTransaction();
        try {
            // Remove any prior pending attempt for this email (single active flow).
            $stmtDel = $this->pdo->prepare("DELETE FROM pending_registrations WHERE email = :email");
            $stmtDel->execute([':email' => $email]);

            $stmt = $this->pdo->prepare("
                INSERT INTO pending_registrations
                    (id, email, password_hash, first_name, middle_name, last_name, suffix, birthdate,
                     gender, civil_status, street_address, id_document_path,
                     verification_code_hash, code_expires_at)
                VALUES
                    (:id, :email, :password_hash, :first_name, :middle_name, :last_name, :suffix, :birthdate,
                     :gender, :civil_status, :street_address, :id_doc_path,
                     :code_hash, DATE_ADD(NOW(), INTERVAL :ttl SECOND))
            ");
            $stmt->execute([
                ':id' => $pendingId,
                ':email' => $email,
                ':password_hash' => $passwordHash,
                ':first_name' => $firstName,
                ':middle_name' => $middleName !== '' ? $middleName : null,
                ':last_name' => $lastName,
                ':suffix' => $suffix !== '' ? $suffix : null,
                ':birthdate' => $birthdate,
                ':gender' => $gender,
                ':civil_status' => $civilStatus,
                ':street_address' => $streetAddress,
                ':id_doc_path' => $idDocumentPath,
                ':code_hash' => $codeHash,
                ':ttl' => self::CODE_TTL_SECONDS,
            ]);

            $this->pdo->commit();
        } catch (Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $this->sendVerificationEmail($email, $firstName, (string) $code);

        return [
            'pending_id' => $pendingId,
            'email' => $email,
        ];
    }

    /**
     * Resend the verification code for a pending registration.
     *
     * @param string $email Registered pending email address.
     * @return array{email: string} Resent status payload.
     * @throws InvalidArgumentException If email invalid or pending registration expired/missing.
     */
    public function resendCode(string $email): array {
        $email = trim(filter_var($email, FILTER_SANITIZE_EMAIL));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException("Please provide a valid email address.");
        }

        $this->purgeExpiredPending();

        $stmt = $this->pdo->prepare("SELECT id, first_name FROM pending_registrations WHERE email = :email");
        $stmt->execute([':email' => $email]);
        $pending = $stmt->fetch();
        if (!$pending) {
            throw new InvalidArgumentException("This registration has expired or no longer exists. Please register again.");
        }

        $code = $this->generateVerificationCode();
        $codeHash = password_hash((string) $code, PASSWORD_BCRYPT, ['cost' => 12]);

        $stmtUpd = $this->pdo->prepare("
            UPDATE pending_registrations
            SET verification_code_hash = :code_hash,
                code_expires_at = DATE_ADD(NOW(), INTERVAL :ttl SECOND),
                verify_attempts = 0
            WHERE id = :id
        ");
        $stmtUpd->execute([
            ':code_hash' => $codeHash,
            ':ttl' => self::CODE_TTL_SECONDS,
            ':id' => $pending['id'],
        ]);

        $this->sendVerificationEmail($email, $pending['first_name'], (string) $code);

        return ['email' => $email];
    }

    /**
     * Phase 2: verify the 6-digit code. On success, atomically create the
     * users + resident_profiles rows and delete the pending record.
     *
     * @param string $email Registered email address.
     * @param string $code 6-digit verification code.
     * @return array{id: string, email: string, role_name: string} Created user account session array.
     * @throws InvalidArgumentException If code incorrect, expired, or attempts exceeded.
     * @throws RuntimeException If role configuration missing.
     */
    public function verifyCode(string $email, string $code): array {

        $email = trim($email);
        $code = trim($code);

        if (!preg_match('/^\d{6}$/', $code)) {
            throw new InvalidArgumentException("Verification code must be 6 digits.");
        }

        $stmt = $this->pdo->prepare("SELECT * FROM pending_registrations WHERE email = :email FOR UPDATE");
        $stmt->execute([':email' => $email]);
        $pending = $stmt->fetch();

        if (!$pending) {
            throw new InvalidArgumentException("This verification has expired or no longer exists. Please register again.");
        }

        if ((int) $pending['verify_attempts'] >= self::CODE_MAX_VERIFY_ATTEMPTS) {
            throw new InvalidArgumentException("Too many failed attempts. Please tap \"Resend code\" to get a new one.");
        }

        $expires = strtotime($pending['code_expires_at']);
        if ($expires === false || $expires < time()) {
            throw new InvalidArgumentException("This code has expired. Tap \"Resend code\" to get a new one.");
        }

        if (!password_verify($code, $pending['verification_code_hash'])) {
            // Increment failed attempts (capped by DB-level enforcement above).
            $stmtUpd = $this->pdo->prepare("UPDATE pending_registrations SET verify_attempts = verify_attempts + 1 WHERE id = :id");
            $stmtUpd->execute([':id' => $pending['id']]);
            throw new InvalidArgumentException("Incorrect verification code.");
        }

        $stmtRole = $this->pdo->prepare("SELECT id, name FROM roles WHERE name = 'RESIDENT'");
        $stmtRole->execute();
        $role = $stmtRole->fetch();
        if (!$role) {
            throw new RuntimeException("Default system role 'RESIDENT' not found.");
        }

        $userId = $this->generateUuid();

        $this->pdo->beginTransaction();
        try {
            $stmtInsert = $this->pdo->prepare("
                INSERT INTO users (id, role_id, email, password_hash, is_active, email_verified_at, created_at, updated_at)
                VALUES (:id, :role_id, :email, :password_hash, 1, NOW(), NOW(), NOW())
            ");
            $stmtInsert->execute([
                ':id' => $userId,
                ':role_id' => $role['id'],
                ':email' => $pending['email'],
                ':password_hash' => $pending['password_hash'],
            ]);

            $idDocPath = $pending['id_document_path'] ?? null;

            $stmtProfile = $this->pdo->prepare("
                INSERT INTO resident_profiles
                    (id, user_id, first_name, middle_name, last_name, suffix, birthdate,
                     gender, civil_status, contact_number, street_address, voter_status,
                     verification_status, id_document_path)
                VALUES
                    (:id, :user_id, :first_name, :middle_name, :last_name, :suffix, :birthdate,
                     :gender, :civil_status, '', :street_address, 0,
                     'PENDING', :id_doc_path)
            ");
            $stmtProfile->execute([
                ':id' => $this->generateUuid(),
                ':user_id' => $userId,
                ':first_name' => $pending['first_name'],
                ':middle_name' => $pending['middle_name'],
                ':last_name' => $pending['last_name'],
                ':suffix' => $pending['suffix'],
                ':birthdate' => $pending['birthdate'],
                ':gender' => $pending['gender'],
                ':civil_status' => $pending['civil_status'],
                ':street_address' => $pending['street_address'],
                ':id_doc_path' => $idDocPath,
            ]);

            $stmtDel = $this->pdo->prepare("DELETE FROM pending_registrations WHERE id = :id");
            $stmtDel->execute([':id' => $pending['id']]);

            Logger::audit($userId, 'REGISTER', 'users', $userId, null, [
                'email' => $pending['email'],
                'role' => 'RESIDENT',
                'first_name' => $pending['first_name'],
                'last_name' => $pending['last_name'],
                'verification_status' => 'PENDING',
            ]);

            $this->pdo->commit();

            // Send Application Successful - Pending Verification email
            $this->sendApplicationSubmittedEmail($pending['email'], $pending['first_name']);

            return [
                'id' => $userId,
                'email' => $pending['email'],
                'role_name' => 'RESIDENT',
                'verification_status' => 'PENDING',
            ];
        } catch (Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Password reset — phase 1: validate email, generate a 6-digit code,
     * persist a PENDING reset (no password involved yet), and email the code.
     */
    public function requestPasswordReset(string $email): array {
        $email = trim(filter_var($email, FILTER_SANITIZE_EMAIL));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException("Please provide a valid email address.");
        }

        $stmtUser = $this->pdo->prepare("SELECT u.id, u.email FROM users u WHERE u.email = :email");
        $stmtUser->execute([':email' => $email]);
        $user = $stmtUser->fetch();
        if (!$user) {
            // Do not reveal whether the email exists (prevents user enumeration).
            throw new InvalidArgumentException("If this email is registered, a reset code has been sent.");
        }

        $this->purgeExpiredPending();

        $code = $this->generateVerificationCode();
        $codeHash = password_hash((string) $code, PASSWORD_BCRYPT, ['cost' => 12]);
        $resetId = $this->generateUuid();

        $this->pdo->beginTransaction();
        try {
            $stmtDel = $this->pdo->prepare("DELETE FROM password_resets WHERE email = :email");
            $stmtDel->execute([':email' => $email]);

            $stmt = $this->pdo->prepare("
                INSERT INTO password_resets
                    (id, email, verification_code_hash, code_expires_at)
                VALUES
                    (:id, :email, :code_hash, DATE_ADD(NOW(), INTERVAL :ttl SECOND))
            ");
            $stmt->execute([
                ':id' => $resetId,
                ':email' => $email,
                ':code_hash' => $codeHash,
                ':ttl' => self::CODE_TTL_SECONDS,
            ]);
            $this->pdo->commit();
        } catch (Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $this->sendPasswordResetEmail($email, (string) $code);

        return ['email' => $email];
    }

    /**
     * Resend the password-reset code for a pending reset.
     */
    public function resendResetCode(string $email): array {
        $email = trim(filter_var($email, FILTER_SANITIZE_EMAIL));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException("Please provide a valid email address.");
        }

        $this->purgeExpiredPending();

        $stmt = $this->pdo->prepare("SELECT id FROM password_resets WHERE email = :email");
        $stmt->execute([':email' => $email]);
        $reset = $stmt->fetch();
        if (!$reset) {
            throw new InvalidArgumentException("This reset has expired or no longer exists. Please start over.");
        }

        $code = $this->generateVerificationCode();
        $codeHash = password_hash((string) $code, PASSWORD_BCRYPT, ['cost' => 12]);

        $stmtUpd = $this->pdo->prepare("
            UPDATE password_resets
            SET verification_code_hash = :code_hash,
                code_expires_at = DATE_ADD(NOW(), INTERVAL :ttl SECOND),
                verify_attempts = 0,
                reset_token_hash = NULL,
                verified_at = NULL
            WHERE id = :id
        ");
        $stmtUpd->execute([
            ':code_hash' => $codeHash,
            ':ttl' => self::CODE_TTL_SECONDS,
            ':id' => $reset['id'],
        ]);

        $this->sendPasswordResetEmail($email, (string) $code);

        return ['email' => $email];
    }

    /**
     * Password reset — phase 2: verify the code, mark the reset as verified,
     * and issue a one-time reset token (hash stored) authorizing phase 3. The
     * password is still NOT changed here.
     */
    public function verifyResetCode(string $email, string $code): array {
        $email = trim($email);
        $code = trim($code);

        if (!preg_match('/^\d{6}$/', $code)) {
            throw new InvalidArgumentException("Verification code must be 6 digits.");
        }

        $stmt = $this->pdo->prepare("SELECT * FROM password_resets WHERE email = :email FOR UPDATE");
        $stmt->execute([':email' => $email]);
        $reset = $stmt->fetch();

        if (!$reset) {
            throw new InvalidArgumentException("This reset has expired or no longer exists. Please start over.");
        }

        if ((int) $reset['verify_attempts'] >= self::CODE_MAX_VERIFY_ATTEMPTS) {
            throw new InvalidArgumentException("Too many failed attempts. Please tap \"Resend code\" to get a new one.");
        }

        $expires = strtotime($reset['code_expires_at']);
        if ($expires === false || $expires < time()) {
            throw new InvalidArgumentException("This code has expired. Tap \"Resend code\" to get a new one.");
        }

        if (!password_verify($code, $reset['verification_code_hash'])) {
            $stmtUpd = $this->pdo->prepare("UPDATE password_resets SET verify_attempts = verify_attempts + 1 WHERE id = :id");
            $stmtUpd->execute([':id' => $reset['id']]);
            throw new InvalidArgumentException("Incorrect verification code.");
        }

        // Fetch the user id for the audit trail.
        $stmtUser = $this->pdo->prepare("SELECT id FROM users WHERE email = :email");
        $stmtUser->execute([':email' => $email]);
        $user = $stmtUser->fetch();
        if (!$user) {
            // Account vanished between phases — clean up the orphan reset.
            $stmtDel = $this->pdo->prepare("DELETE FROM password_resets WHERE id = :id");
            $stmtDel->execute([':id' => $reset['id']]);
            throw new InvalidArgumentException("Account not found. Please register again.");
        }

        // Issue a one-time reset token authorizing the password-set phase.
        $resetToken = bin2hex(random_bytes(32));
        $resetTokenHash = hash('sha256', $resetToken);

        $this->pdo->beginTransaction();
        try {
            $stmtUpd = $this->pdo->prepare("
                UPDATE password_resets
                SET reset_token_hash = :token_hash,
                    verified_at = NOW()
                WHERE id = :id
            ");
            $stmtUpd->execute([
                ':token_hash' => $resetTokenHash,
                ':id' => $reset['id'],
            ]);
            $this->pdo->commit();
        } catch (Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['email' => $email, 'reset_token' => $resetToken];
    }

    /**
     * Password reset — phase 3: with a valid reset token (from phase 2),
     * apply the new password. The actual password change happens ONLY here.
     */
    public function resetPassword(string $email, string $resetToken, string $newPassword): array {
        $email = trim($email);
        $resetToken = trim($resetToken);

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException("Please provide a valid email address.");
        }
        if (strlen($newPassword) < 8) {
            throw new InvalidArgumentException("Password must be at least 8 characters long.");
        }
        if ($resetToken === '') {
            throw new InvalidArgumentException("Missing or invalid reset token. Please start over.");
        }

        $stmt = $this->pdo->prepare("SELECT * FROM password_resets WHERE email = :email FOR UPDATE");
        $stmt->execute([':email' => $email]);
        $reset = $stmt->fetch();

        if (!$reset || $reset['reset_token_hash'] === null) {
            throw new InvalidArgumentException("This reset has expired or no longer exists. Please start over.");
        }

        if (!hash_equals($reset['reset_token_hash'], hash('sha256', $resetToken))) {
            throw new InvalidArgumentException("Invalid reset token. Please start over.");
        }

        $stmtUser = $this->pdo->prepare("SELECT id FROM users WHERE email = :email");
        $stmtUser->execute([':email' => $email]);
        $user = $stmtUser->fetch();
        if (!$user) {
            $stmtDel = $this->pdo->prepare("DELETE FROM password_resets WHERE id = :id");
            $stmtDel->execute([':id' => $reset['id']]);
            throw new InvalidArgumentException("Account not found. Please register again.");
        }

        $newPassHash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);

        $this->pdo->beginTransaction();
        try {
            $stmtUpd = $this->pdo->prepare("UPDATE users SET password_hash = :hash, updated_at = NOW() WHERE id = :id");
            $stmtUpd->execute([
                ':hash' => $newPassHash,
                ':id' => $user['id'],
            ]);

            $stmtDel = $this->pdo->prepare("DELETE FROM password_resets WHERE id = :id");
            $stmtDel->execute([':id' => $reset['id']]);

            Logger::audit($user['id'], 'PASSWORD_RESET', 'users', $user['id']);

            $this->pdo->commit();
        } catch (Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['email' => $email];
    }

    /**
     * Delete expired pending registrations and password resets. Called
     * opportunistically at the entry of register/resend/reset flows so stale
     * rows never accumulate and users aren't told to "register again" over an
     * expired-but-still-present record.
     */
    private function purgeExpiredPending(): void {
        $this->pdo->exec("DELETE FROM pending_registrations WHERE code_expires_at < NOW()");
        $this->pdo->exec("DELETE FROM password_resets WHERE code_expires_at < NOW()");
    }

    /**
     * Normalize + validate the resident demographic fields (mirrors the DB enums).
     * Returns [firstName, middleName, lastName, suffix, birthdate, gender, civilStatus, streetAddress].
     */
    private function validateProfile(array $profile): array {
        $firstName = trim($profile['first_name'] ?? '');
        $lastName  = trim($profile['last_name'] ?? '');
        $middleName = trim($profile['middle_name'] ?? '');
        $suffix = trim($profile['suffix'] ?? '');
        $birthdate = trim($profile['birthdate'] ?? '');
        $gender = trim($profile['gender'] ?? '');
        $civilStatus = trim($profile['civil_status'] ?? '');
        $streetAddress = trim($profile['street_address'] ?? '');

        if ($firstName === '') {
            throw new InvalidArgumentException("First name is required.");
        }
        if ($lastName === '') {
            throw new InvalidArgumentException("Last name is required.");
        }
        if ($birthdate === '') {
            throw new InvalidArgumentException("Birthdate is required.");
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthdate)) {
            throw new InvalidArgumentException("Birthdate has an invalid format.");
        }
        $birthTs = strtotime($birthdate);
        if ($birthTs === false) {
            throw new InvalidArgumentException("Birthdate is not a valid date.");
        }
        if ($birthTs > time()) {
            throw new InvalidArgumentException("Birthdate cannot be in the future.");
        }

        // Minimum age gate: the barangay serves direct applicants aged 15 and
        // above (below that is handled by a parent/guardian).
        $minAgeYears = 15;
        $minBirthTs = strtotime('-' . $minAgeYears . ' years', time());
        if ($birthTs > $minBirthTs) {
            throw new InvalidArgumentException("You must be at least " . $minAgeYears . " years old to register.");
        }

        // Sanity floor: reject impossibly old dates (no one is 121+). Uses the
        // world's oldest verified person as the practical upper bound.
        $maxAgeYears = 120;
        $maxBirthTs = strtotime('-' . $maxAgeYears . ' years', time());
        if ($birthTs < $maxBirthTs) {
            throw new InvalidArgumentException("Please enter a valid birthdate.");
        }
        if (!in_array($gender, self::ALLOWED_GENDERS, true)) {
            throw new InvalidArgumentException("Please select a valid gender.");
        }
        if (!in_array($civilStatus, self::ALLOWED_CIVIL_STATUS, true)) {
            throw new InvalidArgumentException("Please select a valid civil status.");
        }
        if ($streetAddress === '') {
            throw new InvalidArgumentException("Complete address is required.");
        }

        return [$firstName, $middleName, $lastName, $suffix, $birthdate, $gender, $civilStatus, $streetAddress];
    }

    /**
     * Generate a 6-digit verification code. Overridable in tests.
     */
    protected function generateVerificationCode(): int {
        return random_int(100000, 999999);
    }

    /**
     * Render the native email template and send the verification code via Gmail.
     */
    private function sendVerificationEmail(string $email, string $firstName, string $code): void {
        if (!$this->sendEmails) {
            return; // disabled (e.g. test harness)
        }

        $expiryMinutes = (int) ceil(self::CODE_TTL_SECONDS / 60);
        $this->notifier->verificationCode($email, $firstName, $code, $expiryMinutes);
    }

    /**
     * Render the native password-reset template and send the code via Gmail.
     */
    private function sendPasswordResetEmail(string $email, string $code): void {
        if (!$this->sendEmails) {
            return; // disabled (e.g. test harness)
        }

        $expiryMinutes = (int) ceil(self::CODE_TTL_SECONDS / 60);
        $this->notifier->passwordResetCode($email, $code, $expiryMinutes);
    }

    /**
     * Authenticates user by email and password, updates last_login_at, logs audit entry, and initializes session.
     *
     * @param string $email User email address.
     * @param string $password User password.
     * @return array{id: string, email: string, role_name: string} Active user session array.
     * @throws InvalidArgumentException On empty fields or bad credentials.
     * @throws RuntimeException If account is deactivated.
     */
    public function login(string $email, string $password): array {
        $email = trim($email);
        if (empty($email) || empty($password)) {
            throw new InvalidArgumentException("Email and password are required.");
        }

        $stmt = $this->pdo->prepare("
            SELECT u.id, u.email, u.password_hash, u.is_active, r.name AS role_name
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.email = :email
        ");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            throw new InvalidArgumentException("Invalid email or password.");
        }

        $verStatus = 'VERIFIED';
        // Enforce verification status check for RESIDENT role
        if ($user['role_name'] === 'RESIDENT') {
            $stmtVer = $this->pdo->prepare("SELECT verification_status, rejection_reason FROM resident_profiles WHERE user_id = :uid");
            $stmtVer->execute([':uid' => $user['id']]);
            $profile = $stmtVer->fetch(PDO::FETCH_ASSOC);

            if ($profile) {
                $verStatus = strtoupper($profile['verification_status'] ?? 'PENDING');
                if ($verStatus === 'PENDING' || $verStatus === 'UNVERIFIED') {
                    throw new RuntimeException("Your application is pending verification. Please wait for staff approval.");
                }
                if ($verStatus === 'REJECTED') {
                    $reason = !empty($profile['rejection_reason']) ? $profile['rejection_reason'] : "Valid ID or Pembo address proof did not meet requirements.";
                    throw new RuntimeException("Your application was rejected: " . $reason);
                }
            }
        }

        $stmtUpdate = $this->pdo->prepare("UPDATE users SET last_login_at = NOW() WHERE id = :id");
        $stmtUpdate->execute([':id' => $user['id']]);

        Logger::audit($user['id'], 'LOGIN', 'users', $user['id'], null, [
            'email' => $user['email'],
            'role' => $user['role_name']
        ]);

        CSRF::initSession();
        $_SESSION['auth_user'] = [
            'id' => $user['id'],
            'email' => $user['email'],
            'role_name' => $user['role_name'],
            'verification_status' => $verStatus,
        ];

        return $_SESSION['auth_user'];
    }

    /**
     * Terminate active user session, log audit event, and clear session cookie.
     *
     * @return void
     */
    public function logout(): void {
        CSRF::initSession();
        $user = $_SESSION['auth_user'] ?? null;
        if ($user) {
            Logger::audit($user['id'], 'LOGOUT', 'users', $user['id']);
        }
        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        session_destroy();
    }

    /**
     * Sends email notification upon successful registration submission.
     */
    public function sendApplicationSubmittedEmail(string $email, string $firstName): void {
        $this->notifier->applicationUnderReview($email, $firstName);
    }

    /**
     * Sends email notification when staff/admin approves resident verification.
     */
    public function sendApplicationApprovedEmail(string $email, string $firstName): void {
        $this->notifier->applicationApproved($email, $firstName);
    }

    /**
     * Sends email notification when staff/admin rejects resident verification.
     */
    public function sendApplicationRejectedEmail(string $email, string $firstName, string $rejectionReason): void {
        $this->notifier->applicationRejected($email, $firstName, $rejectionReason);
    }
}

