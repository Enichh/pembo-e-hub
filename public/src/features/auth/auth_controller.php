<?php

declare(strict_types=1);

require_once __DIR__ . '/auth_service.php';
require_once __DIR__ . '/../../lib/csrf.php';
require_once __DIR__ . '/../../lib/response.php';
require_once __DIR__ . '/../../lib/rate_limiter.php';
require_once __DIR__ . '/../../lib/auth_middleware.php';

class AuthController {
    private AuthService $authService;

    public function __construct(?AuthService $authService = null) {
        $this->authService = $authService ?? new AuthService();
    }

    public function handle(string $action): void {
        switch ($action) {
            case 'csrf':
                $this->getCsrfToken();
                break;
            case 'register':
                $this->register();
                break;
            case 'verify_code':
                $this->verifyCode();
                break;
            case 'resend_code':
                $this->resendCode();
                break;
            case 'request_password_reset':
                $this->requestPasswordReset();
                break;
            case 'verify_reset_code':
                $this->verifyResetCode();
                break;
            case 'reset_password':
                $this->resetPassword();
                break;
            case 'resend_reset_code':
                $this->resendResetCode();
                break;
            case 'login':
                $this->login();
                break;
            case 'logout':
                $this->logout();
                break;
            case 'me':
                $this->me();
                break;
            case 'test-admin':
                $this->testAdminAccess();
                break;
            case 'test-staff':
                $this->testStaffAccess();
                break;
            default:
                Response::error("Unknown auth action: {$action}", 404);
        }
    }

    public function getCsrfToken(): void {
        $token = CSRF::generateToken();
        Response::success("CSRF token generated", ['csrf_token' => $token]);
    }

    public function register(): void {
        AuthMiddleware::requireCsrf();

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (!RateLimiter::check("register_{$ip}", 5, 60)) {
            Response::error("Too many registration attempts. Please try again in 1 minute.", 429);
        }

        $input = $this->getJsonInput();

        // Data Privacy Act of 2012 (R.A. 10173), Section 12 — consent is a
        // lawful basis for processing personal information. The checkbox is
        // mandatory; it is received both as a JSON field and as a multipart
        // FormData field.
        $agree = $input['agree'] ?? ($_POST['agree'] ?? '');
        if (!in_array($agree, ['1', 'true', 'on'], true)) {
            Response::error("You must agree to the collection and processing of your personal information (Data Privacy Act of 2012, R.A. 10173) to continue.", 422);
        }

        $email = $input['email'] ?? ($_POST['email'] ?? '');
        $password = $input['password'] ?? ($_POST['password'] ?? '');
        $profile = [
            'first_name'     => $input['first_name'] ?? ($_POST['first_name'] ?? ''),
            'middle_name'    => $input['middle_name'] ?? ($_POST['middle_name'] ?? ''),
            'last_name'      => $input['last_name'] ?? ($_POST['last_name'] ?? ''),
            'suffix'         => $input['suffix'] ?? ($_POST['suffix'] ?? ''),
            'birthdate'      => $input['birthdate'] ?? ($_POST['birthdate'] ?? ''),
            'gender'         => $input['gender'] ?? ($_POST['gender'] ?? ''),
            'civil_status'   => $input['civil_status'] ?? ($_POST['civil_status'] ?? ''),
            'street_address' => $input['street_address'] ?? ($_POST['street_address'] ?? ''),
        ];

        $idDocPath = null;

        // Handle Valid ID file upload if present
        if (isset($_FILES['valid_id']) && $_FILES['valid_id']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['valid_id'];
            $maxSize = 5 * 1024 * 1024; // 5MB
            if ($file['size'] > $maxSize) {
                Response::error("Uploaded Valid ID file size must not exceed 5MB.", 422);
            }

            $allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);

            if (!in_array($mime, $allowedMimes, true)) {
                Response::error("Invalid file format for Valid ID. Please upload a JPEG, PNG, or PDF file.", 422);
            }

            $storageDir = __DIR__ . '/../../../storage/resident_ids';
            if (!is_dir($storageDir)) {
                mkdir($storageDir, 0755, true);
            }

            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if ($ext === '') $ext = ($mime === 'application/pdf') ? 'pdf' : 'jpg';

            $fileName = 'id_' . date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
            $targetPath = $storageDir . '/' . $fileName;

            if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
                Response::error("Failed to save uploaded Valid ID file. Please try again.", 500);
            }

            $idDocPath = 'storage/resident_ids/' . $fileName;
        }

        try {
            $pending = $this->authService->initiateRegistration($email, $password, $profile, $idDocPath);
            Response::success("Verification code sent to your email.", $pending);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 502);
        } catch (Exception $e) {
            Response::error("An error occurred during registration. Please try again.", 500);
        }
    }

    public function verifyCode(): void {
        AuthMiddleware::requireCsrf();

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (!RateLimiter::check("verify_{$ip}", 10, 60)) {
            Response::error("Too many verification attempts. Please try again in 1 minute.", 429);
        }

        $input = $this->getJsonInput();
        $email = $input['email'] ?? '';
        $code = $input['code'] ?? '';

        try {
            $user = $this->authService->verifyCode($email, $code);
            RateLimiter::clear("verify_{$ip}");
            Response::success("Account verified and created successfully.", $user, 201);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            Response::error("Verification could not be completed. Please try again.", 500);
        }
    }

    public function resendCode(): void {
        AuthMiddleware::requireCsrf();

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (!RateLimiter::check("resend_{$ip}", 3, 60)) {
            Response::error("Too many resend requests. Please wait 1 minute before trying again.", 429);
        }

        $input = $this->getJsonInput();
        $email = $input['email'] ?? '';

        try {
            $result = $this->authService->resendCode($email);
            Response::success("A new verification code has been sent to your email.", $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 502);
        } catch (Exception $e) {
            Response::error("Could not resend the code. Please try again.", 500);
        }
    }

    public function requestPasswordReset(): void {
        AuthMiddleware::requireCsrf();

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (!RateLimiter::check("pwreset_{$ip}", 5, 60)) {
            Response::error("Too many reset requests. Please try again in 1 minute.", 429);
        }

        $input = $this->getJsonInput();
        $email = $input['email'] ?? '';

        try {
            $result = $this->authService->requestPasswordReset($email);
            Response::success("If this email is registered, a reset code has been sent.", $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 502);
        } catch (Exception $e) {
            Response::error("Could not process the reset request. Please try again.", 500);
        }
    }

    public function verifyResetCode(): void {
        AuthMiddleware::requireCsrf();

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (!RateLimiter::check("pwreset_verify_{$ip}", 10, 60)) {
            Response::error("Too many verification attempts. Please try again in 1 minute.", 429);
        }

        $input = $this->getJsonInput();
        $email = $input['email'] ?? '';
        $code = $input['code'] ?? '';

        try {
            $result = $this->authService->verifyResetCode($email, $code);
            RateLimiter::clear("pwreset_verify_{$ip}");
            Response::success("Code verified. Set your new password.", $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            Response::error("Password reset could not be completed. Please try again.", 500);
        }
    }

    public function resetPassword(): void {
        AuthMiddleware::requireCsrf();

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (!RateLimiter::check("pwreset_set_{$ip}", 10, 60)) {
            Response::error("Too many attempts. Please try again in 1 minute.", 429);
        }

        $input = $this->getJsonInput();
        $email = $input['email'] ?? '';
        $resetToken = $input['reset_token'] ?? '';
        $newPassword = $input['new_password'] ?? '';

        try {
            $result = $this->authService->resetPassword($email, $resetToken, $newPassword);
            Response::success("Password updated successfully. You can now log in.", $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            Response::error("Password reset could not be completed. Please try again.", 500);
        }
    }

    public function resendResetCode(): void {
        AuthMiddleware::requireCsrf();

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (!RateLimiter::check("pwreset_resend_{$ip}", 3, 60)) {
            Response::error("Too many resend requests. Please wait 1 minute before trying again.", 429);
        }

        $input = $this->getJsonInput();
        $email = $input['email'] ?? '';

        try {
            $result = $this->authService->resendResetCode($email);
            Response::success("A new reset code has been sent to your email.", $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 502);
        } catch (Exception $e) {
            Response::error("Could not resend the reset code. Please try again.", 500);
        }
    }

    public function login(): void {
        AuthMiddleware::requireCsrf();

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (!RateLimiter::check("login_{$ip}", 5, 60)) {
            Response::error("Too many login attempts. Please wait 1 minute before trying again.", 429);
        }

        $input = $this->getJsonInput();
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? '';

        try {
            $user = $this->authService->login($email, $password);
            RateLimiter::clear("login_{$ip}");
            Response::success("Login successful.", $user);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 401);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 403);
        }
    }

    public function logout(): void {
        AuthMiddleware::requireCsrf();
        $this->authService->logout();
        Response::success("Logged out successfully.");
    }

    public function me(): void {
        $user = AuthMiddleware::requireAuth();
        Response::success("Current user session.", $user);
    }

    public function testAdminAccess(): void {
        $user = AuthMiddleware::requireRole(['ADMIN']);
        Response::success("Welcome Administrator! Access granted to Back-Office Management.", $user);
    }

    public function testStaffAccess(): void {
        $user = AuthMiddleware::requireRole(['ADMIN', 'STAFF']);
        Response::success("Welcome Staff Member! Access granted to Records & Processing.", $user);
    }

    private function getJsonInput(): array {
        $raw = file_get_contents('php://input');
        if (empty($raw)) {
            return $_POST;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}
