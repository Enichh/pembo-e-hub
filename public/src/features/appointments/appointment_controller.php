<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/response.php';
require_once __DIR__ . '/../../lib/auth_middleware.php';
require_once __DIR__ . '/appointment_service.php';

class AppointmentController {
    private AppointmentsService $appointments;

    public function __construct(?AppointmentsService $appointments = null) {
        $this->appointments = $appointments ?? new AppointmentsService();
    }

    public function handle(string $action): void {
        switch ($action) {
            case 'appointment_slots':
                $this->getSlots();
                break;
            case 'list_appointments':
                $this->list();
                break;
            case 'create_appointment':
                $this->book();
                break;
            case 'update_appointment_status':
                $this->updateStatus();
                break;
            default:
                Response::error("Unknown appointments action: {$action}", 404);
        }
    }

    public function getSlots(): void {
        AuthMiddleware::requireAuth();
        $date = isset($_GET['date']) ? trim((string) $_GET['date']) : '';
        $allSlots = $this->appointments->slots();
        $taken = ($date !== '') ? $this->appointments->getTakenSlots($date) : [];

        Response::success("Available appointment slots.", [
            'slots' => $allSlots,
            'taken' => $taken,
            'date'  => $date,
        ]);
    }

    public function list(): void {
        $currentUser = AuthMiddleware::requireAuth();
        $filterDate = isset($_GET['date']) ? trim((string) $_GET['date']) : null;

        $page = isset($_GET['page']) ? (int) $_GET['page'] : 0;
        $perPage = isset($_GET['per_page']) ? (int) $_GET['per_page'] : 0;
        $page = max(0, $page);
        $perPage = max(0, min(200, $perPage));

        $filters = [];
        foreach (['q', 'status', 'date'] as $key) {
            if (isset($_GET[$key]) && trim((string) $_GET[$key]) !== '') {
                $filters[$key] = trim((string) $_GET[$key]);
            }
        }

        try {
            $rows = $this->appointments->list($currentUser, $filterDate, $page, $perPage, $filters);
            Response::success("Appointments retrieved.", $rows);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function book(): void {
        $currentUser = AuthMiddleware::requireRole(['RESIDENT']);
        AuthMiddleware::requireCsrf();

        $input = $this->getInput();
        $serviceType = (string)($input['service_type'] ?? '');
        $date = (string)($input['appointment_date'] ?? '');
        $timeSlot = (string)($input['time_slot'] ?? '');

        try {
            $result = $this->appointments->book($currentUser['id'], $serviceType, $date, $timeSlot);
            Response::success('Appointment booked successfully.', $result, 201);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Exception $e) {
            Response::error('Failed to book appointment. Please try again.', 500);
        }
    }

    public function updateStatus(): void {
        $currentUser = AuthMiddleware::requireRole(['STAFF', 'ADMIN']);
        AuthMiddleware::requireCsrf();

        $input = $this->getInput();
        $appointmentId = (string)($input['appointment_id'] ?? '');
        $newStatus = (string)($input['status'] ?? '');
        $cancellationReason = $input['cancellation_reason'] ?? null;

        if ($appointmentId === '' || $newStatus === '') {
            Response::error('Appointment ID and a new status are required.', 400);
        }

        try {
            $result = $this->appointments->updateStatus(
                $appointmentId,
                $newStatus,
                $currentUser['id'],
                $cancellationReason
            );
            Response::success('Appointment status updated.', $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Exception $e) {
            Response::error('Failed to update appointment status. Please try again.', 500);
        }
    }

    /** @return array<string, mixed> */
    private function getInput(): array {
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
