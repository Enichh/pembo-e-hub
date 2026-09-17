<?php

declare(strict_types=1);

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/logger.php';
require_once __DIR__ . '/../../lib/uuid.php';
require_once __DIR__ . '/../../lib/notification_service.php';

/**
 * Service Appointments Management Slice
 *
 * Handles booking, slot availability checks, role-based listing, and status updates for appointments.
 *
 * @package PemboEHub\Features\Appointments
 */
class AppointmentsService {
    /** Barangay service appointment window. */
    public const SLOTS = [
        '09:00-10:00',
        '10:00-11:00',
        '11:00-12:00',
        '13:00-14:00',
        '14:00-15:00',
        '15:00-16:00',
    ];

    private const ALLOWED_TRANSITIONS = ['CONFIRMED', 'CANCELLED', 'ATTENDED', 'NO_SHOW'];

    /**
     * Get available appointment time slots.
     *
     * @return string[] List of valid time slot strings.
     */
    public function slots(): array {
        return self::SLOTS;
    }

    /**
     * Get taken/booked appointment slots for a specific date across all residents.
     *
     * @param string $date YYYY-MM-DD
     * @return string[] List of time slot strings already booked and not cancelled.
     */
    public function getTakenSlots(string $date): array {
        $stmt = $this->pdo->prepare("
            SELECT time_slot
            FROM appointments
            WHERE appointment_date = :date
              AND status NOT IN ('CANCELLED')
        ");
        $stmt->execute([':date' => $date]);
        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    private PDO $pdo;
    private NotificationService $notifier;

    public function __construct(?PDO $pdo = null, ?NotificationService $notifier = null) {
        $this->pdo = $pdo ?? Database::getConnection();
        $this->notifier = $notifier ?? new NotificationService();
    }

    /**
     * Book a service appointment for a resident.
     *
     * @param string $residentId Resident user UUID.
     * @param string $serviceType Service type requested (e.g. 'Barangay Clearance').
     * @param string $date YYYY-MM-DD target appointment date.
     * @param string $timeSlot Scheduled time slot.
     * @return array{id: string, resident_id: string, service_type: string, appointment_date: string, time_slot: string, status: string} Booked appointment payload.
     * @throws InvalidArgumentException On validation failure or when requested slot is already held.
     */
    public function book(string $residentId, string $serviceType, string $date, string $timeSlot): array {
        $serviceType = trim($serviceType);
        if ($serviceType === '') {
            throw new InvalidArgumentException('Service type is required.');
        }
        if (!in_array($timeSlot, self::SLOTS, true)) {
            throw new InvalidArgumentException('Invalid time slot.');
        }
        $dateObj = DateTime::createFromFormat('Y-m-d', $date);
        if ($dateObj === false || $dateObj->format('Y-m-d') !== $date) {
            throw new InvalidArgumentException('Appointment date must be in YYYY-MM-DD format.');
        }
        $today = new DateTime('today');
        if ($dateObj < $today) {
            throw new InvalidArgumentException('Appointment date cannot be in the past.');
        }

        $id = Uuid::v4();

        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO appointments (id, resident_id, service_type, appointment_date, time_slot, status, created_at, updated_at)
                VALUES (:id, :resident_id, :service_type, :appointment_date, :time_slot, 'BOOKED', NOW(), NOW())
            ");
            $stmt->execute([
                ':id' => $id,
                ':resident_id' => $residentId,
                ':service_type' => $serviceType,
                ':appointment_date' => $date,
                ':time_slot' => $timeSlot,
            ]);
        } catch (PDOException $e) {
            // 1062 / SQLSTATE 23000 = duplicate key on uq_resident_slot.
            if ((int)$e->getCode() === 1062 || $e->getCode() === '23000') {
                throw new InvalidArgumentException('That appointment slot is already taken for this date. Please choose another slot.');
            }
            throw $e;
        }

        Logger::audit($residentId, 'CREATE_APPOINTMENT', 'appointments', $id, null, [
            'service_type' => $serviceType,
            'appointment_date' => $date,
            'time_slot' => $timeSlot,
        ]);

        return [
            'id' => $id,
            'resident_id' => $residentId,
            'service_type' => $serviceType,
            'appointment_date' => $date,
            'time_slot' => $timeSlot,
            'status' => 'BOOKED',
        ];
    }

    /**
     * List appointments the caller is authorized to see.
     *
     * Residents keep the legacy flat-array contract (no pagination arguments).
     * When staff/admin supply a positive $page and $perPage, a paginated
     * envelope { data, meta } is returned instead, plus optional $filters:
     *   - 'q'      string  free-text across service type / resident email / name / time slot
     *   - 'status' string  one of BOOKED + ALLOWED_TRANSITIONS
     *   - 'date'   string  YYYY-MM-DD
     *
     * @param array{id: string, role_name: string} $currentUser Authenticated session user.
     * @param string|null $filterDate Optional YYYY-MM-DD filter (kept for legacy callers).
     * @param int $page 1-based page number (0 = legacy flat list).
     * @param int $perPage Rows per page (0 = legacy flat list).
     * @param array<string,string> $filters Optional free-text / status / date filters.
     * @return array<int, array<string, mixed>>|array{data: array, meta: array}
     */
    public function list(array $currentUser, ?string $filterDate = null, int $page = 0, int $perPage = 0, array $filters = []): array {
        $role = strtoupper($currentUser['role_name'] ?? '');
        $isStaff = in_array($role, ['STAFF', 'ADMIN'], true);

        $select = "
            SELECT a.id, a.resident_id, u.email AS resident_email,
                   p.first_name, p.last_name, p.contact_number,
                   a.service_type, a.appointment_date, a.time_slot, a.status,
                   a.cancellation_reason, a.created_at, a.updated_at
        ";
        $from = "
            FROM appointments a
            JOIN users u ON a.resident_id = u.id
            LEFT JOIN resident_profiles p ON p.user_id = u.id
        ";
        $order = ' ORDER BY a.appointment_date ASC, a.time_slot ASC';

        $where = [];
        $params = [];

        if (!$isStaff) {
            $where[] = 'a.resident_id = :resident_id';
            $params[':resident_id'] = $currentUser['id'];
        } else {
            // Staff/admin may use the richer filter set; merge with legacy date filter.
            $legacyDate = ($filterDate !== null && $filterDate !== '')
                ? $filterDate
                : (isset($filters['date']) ? trim((string) $filters['date']) : '');
            $filterArray = ['q' => $filters['q'] ?? '', 'status' => $filters['status'] ?? ''];
            $filter = $this->buildAppointmentFilters($filterArray);
            if ($filter['where'] !== '') {
                $where[] = '(' . $filter['where'] . ')';
                $params = array_merge($params, $filter['params']);
            }
            if ($legacyDate !== '') {
                $where[] = 'a.appointment_date = :filter_date';
                $params[':filter_date'] = $legacyDate;
            }
        }

        $whereClause = empty($where) ? '' : ' WHERE ' . implode(' AND ', $where);

        $paginate = $isStaff && $page > 0 && $perPage > 0;
        if (!$paginate) {
            $stmt = $this->pdo->prepare($select . $from . $whereClause . $order);
            $stmt->execute($params);
            return $stmt->fetchAll();
        }

        $countStmt = $this->pdo->prepare('SELECT COUNT(*) ' . $from . $whereClause);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt = $this->pdo->prepare($select . $from . $whereClause . $order . ' LIMIT :limit OFFSET :offset');
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return [
            'data' => $stmt->fetchAll(),
            'meta' => [
                'total' => $total,
                'page' => $page,
                'per_page' => $perPage,
                'total_pages' => (int) ceil($total / $perPage),
            ],
        ];
    }

    /**
     * Predicate SQL + named params for the staff appointment queue filters.
     * Fail-closed: only recognized values are emitted. Each LIKE operand gets
     * its own bound placeholder (native prepares cannot reuse one).
     *
     * @param array<string,string> $filters 'q' and/or 'status'.
     * @return array{ where: string, params: array<string, string> }
     */
    private function buildAppointmentFilters(array $filters): array {
        $parts = [];
        $params = [];

        $q = isset($filters['q']) ? trim((string) $filters['q']) : '';
        if ($q !== '' && mb_strlen($q) <= 120) {
            $parts[] = '(a.service_type LIKE :q_svc OR u.email LIKE :q_email'
                . ' OR p.first_name LIKE :q_fn OR p.last_name LIKE :q_ln'
                . ' OR a.time_slot LIKE :q_slot)';
            $needle = '%' . $q . '%';
            $params[':q_svc'] = $needle;
            $params[':q_email'] = $needle;
            $params[':q_fn'] = $needle;
            $params[':q_ln'] = $needle;
            $params[':q_slot'] = $needle;
        }

        $allowableStatuses = array_merge(['BOOKED'], self::ALLOWED_TRANSITIONS);
        $status = isset($filters['status']) ? strtoupper(trim((string) $filters['status'])) : '';
        if ($status !== '' && in_array($status, $allowableStatuses, true)) {
            $parts[] = 'a.status = :status';
            $params[':status'] = $status;
        }

        return ['where' => $parts === [] ? '' : implode(' AND ', $parts), 'params' => $params];
    }

    /**
     * Read a single appointment row (used after an id is already known).
     *
     * @param string $appointmentId Target appointment UUID.
     * @return array<string, mixed> Appointment details record.
     * @throws InvalidArgumentException If appointment not found.
     */
    public function getById(string $appointmentId): array {
        $stmt = $this->pdo->prepare("
            SELECT id, resident_id, service_type, appointment_date, time_slot, status,
                   cancellation_reason, created_at, updated_at
            FROM appointments WHERE id = :id
        ");
        $stmt->execute([':id' => $appointmentId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw new InvalidArgumentException('Appointment not found.');
        }
        return $row;
    }

    /**
     * Transition an appointment's status as staff/admin.
     *
     * @param string $appointmentId Appointment UUID.
     * @param string $newStatus Target status (CONFIRMED, CANCELLED, ATTENDED, NO_SHOW).
     * @param string $staffId Staff user UUID performing update.
     * @param string|null $cancellationReason Optional cancellation reason when cancelling.
     * @return array<string, mixed> Updated appointment record with previous_status field.
     * @throws InvalidArgumentException When appointment is missing or target status is invalid.
     */
    public function updateStatus(string $appointmentId, string $newStatus, string $staffId, ?string $cancellationReason = null): array {
        $newStatus = strtoupper(trim($newStatus));
        if (!in_array($newStatus, self::ALLOWED_TRANSITIONS, true)) {
            throw new InvalidArgumentException('Invalid appointment status.');
        }

        $stmt = $this->pdo->prepare("SELECT id, status FROM appointments WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $appointmentId]);
        $appt = $stmt->fetch();
        if (!$appt) {
            throw new InvalidArgumentException('Appointment not found.');
        }

        $reason = ($newStatus === 'CANCELLED') ? $cancellationReason : null;

        $update = $this->pdo->prepare("
            UPDATE appointments
            SET status = :status, cancellation_reason = :reason, updated_at = NOW()
            WHERE id = :id
        ");
        $update->execute([
            ':status' => $newStatus,
            ':reason' => $reason,
            ':id' => $appointmentId,
        ]);

        Logger::audit($staffId, 'UPDATE_APPOINTMENT_STATUS', 'appointments', $appointmentId, [
            'previous_status' => $appt['status'],
        ], [
            'new_status' => $newStatus,
        ]);

        $row = $this->getById($appointmentId);
        $row['previous_status'] = $appt['status'];

        $resident = $this->residentForNotification($row['resident_id']);
        if ($resident !== null) {
            $this->notifier->appointmentStatusChanged(
                $resident['email'],
                $resident['first_name'] ?: '',
                $row['service_type'],
                $row['appointment_date'],
                $row['time_slot'],
                $newStatus,
                $newStatus === 'CANCELLED' ? $row['cancellation_reason'] : null
            );
        }

        return $row;
    }

    /**
     * Resolve a resident's email and first name for notification addressing.
     *
     * @return array{email:string, first_name:string}|null
     */
    private function residentForNotification(string $residentId): ?array {
        $stmt = $this->pdo->prepare('
            SELECT u.email, p.first_name
            FROM users u
            LEFT JOIN resident_profiles p ON p.user_id = u.id
            WHERE u.id = :id
        ');
        $stmt->execute([':id' => $residentId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }
}

