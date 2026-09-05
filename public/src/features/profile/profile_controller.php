<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/response.php';
require_once __DIR__ . '/../../lib/auth_middleware.php';
require_once __DIR__ . '/profile_service.php';

/**
 * Profile controller — HTTP layer only (no SQL, no business rules).
 */
class ProfileController
{
    private ProfileService $profile;

    public function __construct(?ProfileService $profile = null)
    {
        $this->profile = $profile ?? new ProfileService();
    }

    public function handle(string $action): void
    {
        switch ($action) {
            case 'get_profile':
                $this->getProfile();
                break;
            case 'update_profile':
                $this->updateProfile();
                break;
            case 'list_pending_verifications':
                $this->listPendingVerifications();
                break;
            case 'list_verification_queue':
                $this->listVerificationQueue();
                break;
            case 'verify_resident_account':
                $this->verifyResidentAccount();
                break;
            case 'list_resident_directory':
                $this->listResidentDirectory();
                break;
            case 'serve_resident_id':
                $this->serveResidentId();
                break;
            default:
                Response::error("Unknown profile action: {$action}", 404);
        }
    }

    private function getProfile(): void
    {
        $currentUser = AuthMiddleware::requireAuth();

        try {
            $profile = $this->profile->getResidentProfile($currentUser['id']);
            if ($profile === null) {
                Response::error('Profile not found. Contact the Barangay office.', 404);
            }
            Response::success('Profile retrieved.', $profile);
        } catch (Exception $e) {
            error_log('Get profile error: ' . $e->getMessage());
            Response::error('Could not load your profile. Please try again.', 500);
        }
    }

    private function updateProfile(): void
    {
        $currentUser = AuthMiddleware::requireAuth();
        AuthMiddleware::requireCsrf();

        $input = $this->getInput();
        $fields = [
            'first_name' => (string) ($input['first_name'] ?? ''),
            'middle_name' => (string) ($input['middle_name'] ?? ''),
            'last_name' => (string) ($input['last_name'] ?? ''),
            'suffix' => (string) ($input['suffix'] ?? ''),
            'birthdate' => (string) ($input['birthdate'] ?? ''),
            'gender' => (string) ($input['gender'] ?? ''),
            'civil_status' => (string) ($input['civil_status'] ?? ''),
            'contact_number' => (string) ($input['contact_number'] ?? ''),
            'street_address' => (string) ($input['street_address'] ?? ''),
            'voter_status' => !empty($input['voter_status']) ? 1 : 0,
        ];

        try {
            $result = $this->profile->updateResidentProfile($currentUser['id'], $fields);
            Response::success('Profile updated successfully.', $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Exception $e) {
            error_log('Update profile error: ' . $e->getMessage());
            Response::error('Could not update your profile. Please try again.', 500);
        }
    }

    private function listPendingVerifications(): void
    {
        AuthMiddleware::requireRole(['ADMIN', 'STAFF']);

        try {
            $pending = $this->profile->listPendingVerifications();
            Response::success('Pending resident account verifications retrieved.', [
                'pending' => $pending,
                'count'   => count($pending),
            ]);
        } catch (Exception $e) {
            error_log('List pending verifications error: ' . $e->getMessage());
            Response::error('Failed to retrieve pending verifications queue.', 500);
        }
    }

    private function listVerificationQueue(): void
    {
        AuthMiddleware::requireRole(['ADMIN', 'STAFF']);

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
        $perPage = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 0;
        $page = max(0, $page);
        $perPage = max(0, $perPage);
        $q = isset($_GET['q']) ? trim((string)$_GET['q']) : null;
        if ($q === '') {
            $q = null;
        }

        try {
            $result = $this->profile->listPendingVerificationsPaged($page, $perPage, $q);
            Response::success('Pending resident applicant queue retrieved.', $result);
        } catch (Exception $e) {
            error_log('List verification queue error: ' . $e->getMessage());
            Response::error('Failed to retrieve the verification queue.', 500);
        }
    }

    private function verifyResidentAccount(): void
    {
        $staff = AuthMiddleware::requireRole(['ADMIN', 'STAFF']);
        AuthMiddleware::requireCsrf();

        $input = $this->getInput();
        $targetUserId = (string) ($input['user_id'] ?? '');
        $status       = (string) ($input['status'] ?? '');
        $reason       = isset($input['rejection_reason']) ? (string)$input['rejection_reason'] : null;

        if (empty($targetUserId) || empty($status)) {
            Response::error('Target user_id and verification status are required.', 422);
        }

        try {
            $res = $this->profile->verifyResidentAccount($targetUserId, $status, $reason, $staff['id']);
            Response::success($status === 'VERIFIED' ? 'Resident application approved.' : 'Resident application rejected.', $res);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            error_log('Verify resident error: ' . $e->getMessage());
            Response::error('Failed to process verification action.', 500);
        }
    }

    private function listResidentDirectory(): void
    {
        AuthMiddleware::requireRole(['ADMIN', 'STAFF']);

        $query = isset($_GET['search']) ? (string)$_GET['search'] : null;

        try {
            $residents = $this->profile->listResidentDirectory($query);
            Response::success('Resident directory retrieved successfully.', [
                'residents' => $residents,
                'count'     => count($residents),
            ]);
        } catch (Exception $e) {
            error_log('Resident directory error: ' . $e->getMessage());
            Response::error('Failed to retrieve resident directory.', 500);
        }
    }

    private function serveResidentId(): void
    {
        $currentUser = AuthMiddleware::requireAuth();
        $targetUserId = $_GET['user_id'] ?? $currentUser['id'];

        // IDOR Guard: non-staff/admin can only view their own uploaded ID proof
        $role = $currentUser['role_name'] ?? '';
        if ($role !== 'ADMIN' && $role !== 'STAFF' && $currentUser['id'] !== $targetUserId) {
            Response::error('Access denied.', 403);
        }

        $profile = $this->profile->getResidentProfile($targetUserId);
        if (!$profile || empty($profile['id_document_path'])) {
            Response::error('Valid ID attachment not found for this resident.', 404);
        }

        $filePath = __DIR__ . '/../../../' . $profile['id_document_path'];
        if (!file_exists($filePath)) {
            Response::error('Attachment file missing from storage.', 404);
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $filePath);
        finfo_close($finfo);

        $safeName = str_replace(["\r", "\n", '"'], '', basename($filePath));
        header('Content-Type: ' . ($mime ?: 'image/png'));
        header('Content-Disposition: inline; filename="' . $safeName . '"');
        header('Content-Length: ' . filesize($filePath));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store, private');
        readfile($filePath);
        exit;
    }

    /** @return array<string, mixed> */
    private function getInput(): array
    {
        $raw = file_get_contents('php://input');
        if (!empty($raw)) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return array_merge($_POST, $decoded);
            }
        }
        return $_POST;
    }
}
