<?php

declare(strict_types=1);

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/logger.php';
require_once __DIR__ . '/../../lib/uuid.php';
require_once __DIR__ . '/../../lib/notification_service.php';

/**
 * Complaints & Incidents — Slice 4 in the roadmap.
 *
 * Residents file a one-time complaint/incident; staff triage it (assign an
 * officer, move it through investigation), posting updates to the
 * complaint_updates ledger along the way. SQL lives here only, via prepared
 * statements (project rule). Every write is audited.
 */
class ComplaintsService
{
    public const ALLOWED_STATUSES = [
        'FILED',
        'UNDER_INVESTIGATION',
        'HEARING_SCHEDULED',
        'RESOLVED',
        'DISMISSED',
    ];

    // Free-text incident categories surfaced in the UI (incident_type is a
    // varchar, not an enum — see schema). The value stored is the label itself.
    public const INCIDENT_TYPES = [
        'Noise Disturbance',
        'Peace & Order',
        'Solid Waste',
        'Boundary Dispute',
        'Harassment',
        'Other',
    ];

    private PDO $pdo;
    private NotificationService $notifier;

    public function __construct(?PDO $pdo = null, ?NotificationService $notifier = null)
    {
        $this->pdo = $pdo ?? Database::getConnection();
        $this->notifier = $notifier ?? new NotificationService();
    }

    /**
     * Human-readable, unique complaint reference (e.g. CMP-20260904-1A2B3C).
     */
    private function generateComplaintNumber(): string
    {
        return 'CMP-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
    }

    /**
     * File a new complaint (resident). Validates input, inserts the row with
     * status FILED, and writes an audit entry.
     */
    public function create(
        string $residentId,
        string $incidentType,
        string $incidentLocation,
        string $incidentDate,
        string $narrative
    ): array {
        $incidentType = trim($incidentType);
        $incidentLocation = trim($incidentLocation);
        $narrative = trim($narrative);
        $incidentDate = trim($incidentDate);

        if ($incidentType === '') {
            throw new InvalidArgumentException('Incident type is required.');
        }
        if (mb_strlen($incidentType) > 100) {
            throw new InvalidArgumentException('Incident type must be 100 characters or fewer.');
        }
        if ($incidentLocation === '') {
            throw new InvalidArgumentException('Incident location is required.');
        }
        if (mb_strlen($incidentLocation) > 500) {
            throw new InvalidArgumentException('Incident location must be 500 characters or fewer.');
        }
        if ($narrative === '') {
            throw new InvalidArgumentException('Please describe what happened.');
        }
        if (mb_strlen($narrative) > 2000) {
            throw new InvalidArgumentException('Complaint narrative must be 2000 characters or fewer.');
        }
        if ($incidentDate === '') {
            throw new InvalidArgumentException('Incident date is required.');
        }
        $dateObj = DateTime::createFromFormat('Y-m-d\TH:i', $incidentDate);
        if ($dateObj === false) {
            $dateObj = DateTime::createFromFormat('Y-m-d H:i:s', $incidentDate);
        }
        if ($dateObj === false) {
            throw new InvalidArgumentException('Incident date must be a valid date and time.');
        }
        if ($dateObj->getTimestamp() > time()) {
            throw new InvalidArgumentException('Incident date cannot be in the future.');
        }
        $incidentDateForDb = $dateObj->format('Y-m-d H:i:s');

        $id = Uuid::v4();
        $complaintNumber = $this->generateComplaintNumber();

        try {
            $stmt = $this->pdo->prepare('
                INSERT INTO complaints
                    (id, complaint_number, resident_id, incident_type, incident_location,
                     incident_date, narrative_details, status, created_at, updated_at)
                VALUES
                    (:id, :complaint_number, :resident_id, :incident_type, :incident_location,
                     :incident_date, :narrative, \'FILED\', NOW(), NOW())
            ');
            $stmt->execute([
                ':id' => $id,
                ':complaint_number' => $complaintNumber,
                ':resident_id' => $residentId,
                ':incident_type' => $incidentType,
                ':incident_location' => $incidentLocation,
                ':incident_date' => $incidentDateForDb,
                ':narrative' => $narrative,
            ]);
        } catch (PDOException $e) {
            // UNIQUE(complaint_number) collision is astronomically unlikely, but
            // translate it cleanly rather than surfacing a raw 500.
            if ((int)$e->getCode() === 1062 || $e->getCode() === '23000') {
                throw new InvalidArgumentException('Could not file this complaint. Please try again.');
            }
            throw $e;
        }

        Logger::audit($residentId, 'CREATE_COMPLAINT', 'complaints', $id, null, [
            'complaint_number' => $complaintNumber,
            'incident_type' => $incidentType,
        ]);

        return [
            'id' => $id,
            'complaint_number' => $complaintNumber,
            'incident_type' => $incidentType,
            'incident_date' => $incidentDateForDb,
            'status' => 'FILED',
        ];
    }

    /**
     * List the current user's own complaints (IDOR-safe: scoped to session user).
     */
    public function listMine(string $residentId): array
    {
        $stmt = $this->pdo->prepare('
            SELECT id, complaint_number, incident_type, incident_location, incident_date,
                   narrative_details, status, created_at, updated_at
            FROM complaints
            WHERE resident_id = :resident_id
            ORDER BY created_at DESC
        ');
        $stmt->execute([':resident_id' => $residentId]);
        return $stmt->fetchAll();
    }

    /**
     * List all complaints for staff/admins (triage queue). No client-supplied id.
     *
     * With $page and $perPage provided, returns a paginated envelope
     * { data, meta }; otherwise it keeps the legacy flat-array contract so the
     * older in-page queue renderers never break. Optional $filters:
     *   - 'q'      string  free-text across complaint number / type / location / narrative / resident email
     *   - 'status' string  one of ALLOWED_STATUSES
     */
    public function listAll(int $page = 0, int $perPage = 0, array $filters = []): array
    {
        $select = "
            SELECT c.id, c.complaint_number, c.incident_type, c.incident_location,
                   c.incident_date, c.narrative_details, c.status, c.created_at,
                   c.updated_at, c.resident_id, u.email AS resident_email, o.email AS officer_email
        ";
        $from = "
            FROM complaints c
            JOIN users u ON c.resident_id = u.id
            LEFT JOIN users o ON c.assigned_officer_id = o.id
        ";
        $order = ' ORDER BY c.created_at DESC';

        $filter = $this->buildComplaintFilters($filters);
        $whereClause = $filter['where'] === '' ? '' : ' WHERE ' . $filter['where'];
        $params = $filter['params'];

        $paginate = $page > 0 && $perPage > 0;
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
     * Predicate SQL + named params for the complaint triage filters. Only
     * recognized values are emitted (fail-closed: unrecognized input never
     * reaches the builder). Native prepares cannot reuse a placeholder, so each
     * LIKE operand gets its own bound name for the shared value.
     *
     * @return array{ where: string, params: array<string, string> }
     */
    private function buildComplaintFilters(array $filters): array
    {
        $parts = [];
        $params = [];

        $q = isset($filters['q']) ? trim((string) $filters['q']) : '';
        if ($q !== '' && mb_strlen($q) <= 120) {
            $parts[] = '(c.complaint_number LIKE :q_no OR c.incident_type LIKE :q_type'
                . ' OR c.incident_location LIKE :q_loc OR c.narrative_details LIKE :q_narr'
                . ' OR u.email LIKE :q_email)';
            $needle = '%' . $q . '%';
            $params[':q_no'] = $needle;
            $params[':q_type'] = $needle;
            $params[':q_loc'] = $needle;
            $params[':q_narr'] = $needle;
            $params[':q_email'] = $needle;
        }

        $status = isset($filters['status']) ? strtoupper(trim((string) $filters['status'])) : '';
        if ($status !== '' && in_array($status, self::ALLOWED_STATUSES, true)) {
            $parts[] = 'c.status = :status';
            $params[':status'] = $status;
        }

        return ['where' => $parts === [] ? '' : implode(' AND ', $parts), 'params' => $params];
    }

    /**
     * Fetch a single complaint by id (used by resident detail + staff actions).
     */
    public function getById(string $complaintId): ?array
    {
        $stmt = $this->pdo->prepare('
            SELECT c.*, u.email AS resident_email, o.email AS officer_email
            FROM complaints c
            JOIN users u ON c.resident_id = u.id
            LEFT JOIN users o ON c.assigned_officer_id = o.id
            WHERE c.id = :id
        ');
        $stmt->execute([':id' => $complaintId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Staff: assign an officer and/or transition the complaint's status. Posts
     * a complaint_updates ledger row and audits the change.
     */
    public function updateStatus(
        string $complaintId,
        string $newStatus,
        string $staffId,
        ?string $assignedOfficerId = null,
        ?string $actionTaken = null,
        ?string $hearingDate = null,
        ?string $resolutionNotes = null
    ): array {
        $newStatus = strtoupper(trim($newStatus));
        if (!in_array($newStatus, self::ALLOWED_STATUSES, true)) {
            throw new InvalidArgumentException('Invalid complaint status.');
        }

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT id, status, assigned_officer_id FROM complaints WHERE id = :id FOR UPDATE');
            $stmt->execute([':id' => $complaintId]);
            $complaint = $stmt->fetch();
            if (!$complaint) {
                $this->pdo->rollBack();
                throw new InvalidArgumentException('Complaint not found.');
            }

            $officerId = $assignedOfficerId !== null && trim($assignedOfficerId) !== ''
                ? trim($assignedOfficerId)
                : $complaint['assigned_officer_id'];

            $update = $this->pdo->prepare('
                UPDATE complaints
                SET status = :status, assigned_officer_id = :officer_id, updated_at = NOW()
                WHERE id = :id
            ');
            $update->execute([
                ':status' => $newStatus,
                ':officer_id' => $officerId,
                ':id' => $complaintId,
            ]);

            // Ledger row describing this action.
            $updateId = Uuid::v4();
            $action = $actionTaken !== null ? trim($actionTaken) : 'Status updated to ' . $newStatus;
            if ($action === '') {
                $action = 'Status updated to ' . $newStatus;
            }
            $hearing = $hearingDate !== null && trim($hearingDate) !== ''
                ? trim($hearingDate)
                : null;

            $ledger = $this->pdo->prepare('
                INSERT INTO complaint_updates
                    (id, complaint_id, staff_id, action_taken, hearing_date, resolution_notes, status_at_update, created_at)
                VALUES
                    (:id, :complaint_id, :staff_id, :action_taken, :hearing_date, :resolution_notes, :status_at_update, NOW())
            ');
            $ledger->execute([
                ':id' => $updateId,
                ':complaint_id' => $complaintId,
                ':staff_id' => $staffId,
                ':action_taken' => $action,
                ':hearing_date' => $hearing,
                ':resolution_notes' => $resolutionNotes !== null ? trim($resolutionNotes) : '',
                ':status_at_update' => $newStatus,
            ]);

            $this->pdo->commit();
        } catch (InvalidArgumentException $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        } catch (Exception $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        Logger::audit($staffId, 'UPDATE_COMPLAINT_STATUS', 'complaints', $complaintId, [
            'previous_status' => $complaint['status'],
        ], [
            'new_status' => $newStatus,
        ]);

        $updated = $this->getById($complaintId) ?? [];

        if (!empty($updated['resident_email'])) {
            $this->notifier->complaintStatusChanged(
                $updated['resident_email'],
                $this->residentFirstName($updated['resident_id']),
                $updated['complaint_number'],
                $updated['incident_type'],
                $newStatus,
                $hearingDate
            );
        }

        return $updated;
    }

    /**
     * Resident first name lookup for notification addressing.
     */
    private function residentFirstName(string $residentId): string {
        $stmt = $this->pdo->prepare('SELECT first_name FROM resident_profiles WHERE user_id = :id LIMIT 1');
        $stmt->execute([':id' => $residentId]);
        $first = $stmt->fetchColumn();
        return $first === false ? '' : (string) $first;
    }

    /**
     * Staff: list officers (staff/admin users) to assign to a complaint.
     */
    public function listOfficers(): array
    {
        $stmt = $this->pdo->query('
            SELECT u.id, u.email
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE r.name IN (\'STAFF\', \'ADMIN\')
            ORDER BY u.email ASC
        ');
        return $stmt->fetchAll();
    }

    /**
     * History of a complaint (updates ledger).
     */
    public function listUpdates(string $complaintId): array
    {
        $stmt = $this->pdo->prepare('
            SELECT cu.action_taken, cu.hearing_date, cu.resolution_notes,
                   cu.status_at_update, cu.created_at, u.email AS staff_email
            FROM complaint_updates cu
            JOIN users u ON cu.staff_id = u.id
            WHERE cu.complaint_id = :complaint_id
            ORDER BY cu.created_at ASC
        ');
        $stmt->execute([':complaint_id' => $complaintId]);
        return $stmt->fetchAll();
    }
}
