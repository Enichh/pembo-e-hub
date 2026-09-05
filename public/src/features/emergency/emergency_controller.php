<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/response.php';
require_once __DIR__ . '/../../lib/auth_middleware.php';
require_once __DIR__ . '/emergency_service.php';

/**
 * Emergency SOS controller — HTTP layer only (no SQL, no business rules).
 */
class EmergencyController
{
    private EmergencyService $emergency;

    public function __construct(?EmergencyService $emergency = null)
    {
        $this->emergency = $emergency ?? new EmergencyService();
    }

    public function handle(string $action): void
    {
        switch ($action) {
            case 'trigger_sos':
                $this->trigger();
                break;
            case 'list_my_sos':
                $this->listMine();
                break;
            case 'list_active_sos':
                $this->listActive();
                break;
            case 'update_sos_status':
                $this->updateSosStatus();
                break;
            case 'list_sos_dispatch_logs':
                $this->listDispatchLogs();
                break;
            default:
                Response::error("Unknown emergency action: {$action}", 404);
        }
    }

    private function trigger(): void
    {
        $currentUser = AuthMiddleware::requireRole(['RESIDENT']);
        AuthMiddleware::requireCsrf();

        $input = $this->getInput();
        $type = (string)($input['emergency_type'] ?? '');
        $latitude = isset($input['latitude']) ? (float)$input['latitude'] : null;
        $longitude = isset($input['longitude']) ? (float)$input['longitude'] : null;
        $accuracy = isset($input['accuracy_meters']) && $input['accuracy_meters'] !== ''
            ? (float)$input['accuracy_meters']
            : null;

        if ($type === '' || $latitude === null || $longitude === null) {
            Response::error('Emergency type, latitude, and longitude are required.', 400);
        }

        try {
            $result = $this->emergency->triggerSos($currentUser['id'], $type, $latitude, $longitude, $accuracy);
            Response::success('Emergency alert sent.', $result, 201);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Exception $e) {
            error_log('Trigger SOS error: ' . $e->getMessage());
            Response::error('Failed to send emergency alert. Please try again.', 500);
        }
    }

    private function listMine(): void
    {
        $currentUser = AuthMiddleware::requireAuth();
        $rows = $this->emergency->listMySos($currentUser['id']);
        Response::success('Your emergency reports retrieved.', $rows);
    }

    private function listActive(): void
    {
        AuthMiddleware::requireRole(['STAFF', 'ADMIN']);
        $page = isset($_GET['page']) ? (int) $_GET['page'] : 0;
        $perPage = isset($_GET['per_page']) ? (int) $_GET['per_page'] : 0;
        $page = max(0, $page);
        $perPage = max(0, min(200, $perPage));

        $filters = [];
        foreach (['q', 'type'] as $key) {
            if (isset($_GET[$key]) && trim((string) $_GET[$key]) !== '') {
                $filters[$key] = trim((string) $_GET[$key]);
            }
        }

        $rows = $this->emergency->listActive($page, $perPage, $filters);
        Response::success('Active emergency reports retrieved.', $rows);
    }

    private function updateSosStatus(): void
    {
        $staff = AuthMiddleware::requireRole(['STAFF', 'ADMIN']);
        AuthMiddleware::requireCsrf();

        $input = $this->getInput();
        $sosId = (string)($input['sos_id'] ?? '');
        $newStatus = (string)($input['status'] ?? '');
        $team = isset($input['responder_team']) ? (string)$input['responder_team'] : null;
        $notes = isset($input['action_notes']) ? (string)$input['action_notes'] : null;

        if ($sosId === '' || $newStatus === '') {
            Response::error('SOS id and target status are required.', 400);
        }

        try {
            $result = $this->emergency->updateSosStatus($sosId, $newStatus, $staff['id'], $team, $notes);
            Response::success('Emergency dispatch status updated.', $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            error_log('Update SOS error: ' . $e->getMessage());
            Response::error('Failed to update emergency dispatch status.', 500);
        }
    }

    private function listDispatchLogs(): void
    {
        AuthMiddleware::requireRole(['STAFF', 'ADMIN']);

        $sosId = (string)($_GET['id'] ?? '');
        if ($sosId === '') {
            Response::error('SOS id is required.', 400);
        }

        try {
            $rows = $this->emergency->listDispatchLogs($sosId);
            Response::success('Dispatch logs retrieved.', $rows);
        } catch (Exception $e) {
            Response::error('Failed to retrieve dispatch logs.', 500);
        }
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
