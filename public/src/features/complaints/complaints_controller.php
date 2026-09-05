<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/response.php';
require_once __DIR__ . '/../../lib/auth_middleware.php';
require_once __DIR__ . '/complaints_service.php';

/**
 * Complaints controller — HTTP layer only (no SQL, no business rules).
 */
class ComplaintsController
{
    private ComplaintsService $complaints;

    public function __construct(?ComplaintsService $complaints = null)
    {
        $this->complaints = $complaints ?? new ComplaintsService();
    }

    public function handle(string $action): void
    {
        switch ($action) {
            case 'create_complaint':
                $this->create();
                break;
            case 'list_my_complaints':
                $this->listMine();
                break;
            case 'list_all_complaints':
                $this->listAll();
                break;
            case 'get_complaint':
                $this->getOne();
                break;
            case 'update_complaint_status':
                $this->updateStatus();
                break;
            case 'list_officers':
                $this->listOfficers();
                break;
            default:
                Response::error("Unknown complaints action: {$action}", 404);
        }
    }

    private function create(): void
    {
        $currentUser = AuthMiddleware::requireRole(['RESIDENT']);
        AuthMiddleware::requireCsrf();

        $input = $this->getInput();
        $incidentType = (string) ($input['incident_type'] ?? '');
        $incidentLocation = (string) ($input['incident_location'] ?? '');
        $incidentDate = (string) ($input['incident_date'] ?? '');
        $narrative = (string) ($input['narrative_details'] ?? '');

        try {
            $result = $this->complaints->create(
                $currentUser['id'],
                $incidentType,
                $incidentLocation,
                $incidentDate,
                $narrative
            );
            Response::success('Complaint filed.', $result, 201);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            error_log('Create complaint error: ' . $e->getMessage());
            Response::error('Could not file your complaint. Please try again.', 500);
        }
    }

    private function listMine(): void
    {
        $currentUser = AuthMiddleware::requireAuth();
        $rows = $this->complaints->listMine($currentUser['id']);
        Response::success('Your complaints retrieved.', $rows);
    }

    private function listAll(): void
    {
        AuthMiddleware::requireRole(['STAFF', 'ADMIN']);
        $page = isset($_GET['page']) ? (int) $_GET['page'] : 0;
        $perPage = isset($_GET['per_page']) ? (int) $_GET['per_page'] : 0;
        $page = max(0, $page);
        $perPage = max(0, min(200, $perPage));

        $filters = [];
        foreach (['q', 'status'] as $key) {
            if (isset($_GET[$key]) && trim((string) $_GET[$key]) !== '') {
                $filters[$key] = trim((string) $_GET[$key]);
            }
        }

        $rows = $this->complaints->listAll($page, $perPage, $filters);
        Response::success('Complaint queue retrieved.', $rows);
    }

    private function getOne(): void
    {
        $currentUser = AuthMiddleware::requireAuth();
        $id = (string) ($_GET['id'] ?? $this->getInput()['id'] ?? '');

        if ($id === '') {
            Response::error('Complaint id is required.', 400);
        }

        $complaint = $this->complaints->getById($id);
        if ($complaint === null) {
            Response::error('Complaint not found.', 404);
        }

        // IDOR guard: a resident may only read their own complaint.
        $role = strtoupper($currentUser['role_name'] ?? '');
        $isStaff = in_array($role, ['STAFF', 'ADMIN'], true);
        if (!$isStaff && $complaint['resident_id'] !== $currentUser['id']) {
            Response::error('Complaint not found.', 404);
        }

        Response::success('Complaint retrieved.', $complaint);
    }

    private function updateStatus(): void
    {
        $currentUser = AuthMiddleware::requireRole(['STAFF', 'ADMIN']);
        AuthMiddleware::requireCsrf();

        $input = $this->getInput();
        $id = (string) ($input['complaint_id'] ?? '');
        $newStatus = (string) ($input['status'] ?? '');
        $assignedOfficerId = isset($input['assigned_officer_id']) ? (string) $input['assigned_officer_id'] : null;
        $actionTaken = isset($input['action_taken']) ? (string) $input['action_taken'] : null;
        $hearingDate = isset($input['hearing_date']) ? (string) $input['hearing_date'] : null;
        $resolutionNotes = isset($input['resolution_notes']) ? (string) $input['resolution_notes'] : null;

        if ($id === '' || $newStatus === '') {
            Response::error('Complaint id and status are required.', 400);
        }

        try {
            $result = $this->complaints->updateStatus(
                $id,
                $newStatus,
                $currentUser['id'],
                $assignedOfficerId,
                $actionTaken,
                $hearingDate,
                $resolutionNotes
            );
            Response::success('Complaint updated.', $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            error_log('Update complaint error: ' . $e->getMessage());
            Response::error('Could not update the complaint. Please try again.', 500);
        }
    }

    private function listOfficers(): void
    {
        AuthMiddleware::requireRole(['STAFF', 'ADMIN']);
        $rows = $this->complaints->listOfficers();
        Response::success('Officers retrieved.', $rows);
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
