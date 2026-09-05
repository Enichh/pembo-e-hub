<?php

declare(strict_types=1);

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/logger.php';
require_once __DIR__ . '/../../lib/uuid.php';

/**
 * Emergency SOS feature — Slice 5 in the roadmap.
 *
 * Residents trigger a one-time SOS with their GPS coordinates; staff later
 * acknowledge and dispatch responders (the dispatch workflow is a separate
 * concern kept out of this service for now).
 *
 * SQL lives here only, via prepared statements (project rule).
 */
class EmergencyService
{
    public const ALLOWED_TYPES = [
        'MEDICAL',
        'FIRE',
        'POLICE_SECURITY',
        'NATURAL_DISASTER',
        'OTHER',
    ];

    public const ALLOWED_TRANSITIONS = [
        'TRIGGERED',
        'ACKNOWLEDGED',
        'RESPONDERS_DISPATCHED',
        'RESOLVED',
        'FALSE_ALARM',
    ];

    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Database::getConnection();
    }

    /**
     * Generate a short human-readable SOS code (unique via DB constraint).
     */
    private function generateSosCode(): string
    {
        return 'SOS-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
    }

    /**
     * Record a resident's emergency SOS trigger.
     *
     * @param string $residentId Authenticated resident id.
     * @param string $type       One of ALLOWED_TYPES.
     * @param float  $latitude   GPS latitude (-90..90).
     * @param float  $longitude  GPS longitude (-180..180).
     * @param float|null $accuracyMeters Optional GPS accuracy estimate.
     */
    public function triggerSos(
        string $residentId,
        string $type,
        float $latitude,
        float $longitude,
        ?float $accuracyMeters = null
    ): array {
        $type = strtoupper(trim($type));
        if (!in_array($type, self::ALLOWED_TYPES, true)) {
            throw new InvalidArgumentException('Invalid emergency type.');
        }
        if ($latitude < -90.0 || $latitude > 90.0) {
            throw new InvalidArgumentException('Latitude must be between -90 and 90.');
        }
        if ($longitude < -180.0 || $longitude > 180.0) {
            throw new InvalidArgumentException('Longitude must be between -180 and 180.');
        }

        $id = Uuid::v4();
        $sosCode = $this->generateSosCode();

        $stmt = $this->pdo->prepare('
            INSERT INTO emergency_sos
                (id, sos_code, resident_id, emergency_type, latitude, longitude, accuracy_meters, status, created_at)
            VALUES
                (:id, :sos_code, :resident_id, :type, :lat, :lng, :accuracy, \'TRIGGERED\', NOW())
        ');
        $stmt->execute([
            ':id' => $id,
            ':sos_code' => $sosCode,
            ':resident_id' => $residentId,
            ':type' => $type,
            ':lat' => $latitude,
            ':lng' => $longitude,
            ':accuracy' => $accuracyMeters,
        ]);

        Logger::audit($residentId, 'TRIGGER_SOS', 'emergency_sos', $id, null, [
            'sos_code' => $sosCode,
            'type' => $type,
            'latitude' => $latitude,
            'longitude' => $longitude,
        ]);

        return [
            'id' => $id,
            'sos_code' => $sosCode,
            'emergency_type' => $type,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'status' => 'TRIGGERED',
        ];
    }

    /**
     * List the current user's own SOS reports (IDOR-safe: scoped to session user).
     */
    public function listMySos(string $residentId): array
    {
        $stmt = $this->pdo->prepare('
            SELECT id, sos_code, emergency_type, latitude, longitude, status, created_at, resolved_at
            FROM emergency_sos
            WHERE resident_id = :resident_id
            ORDER BY created_at DESC
        ');
        $stmt->execute([':resident_id' => $residentId]);
        return $stmt->fetchAll();
    }

    /**
     * List active (unresolved) SOS reports for the staff dispatch view.
     *
     * With $page and $perPage provided, returns a paginated envelope
     * { data, meta }; otherwise keeps the legacy flat-array contract. Optional
     * $filters:
     *   - 'q'     string  free-text across sos code / resident email / emergency type
     *   - 'type'  string  one of ALLOWED_TYPES
     */
    public function listActive(int $page = 0, int $perPage = 0, array $filters = []): array
    {
        $select = "
            SELECT s.id, s.sos_code, s.emergency_type, s.latitude, s.longitude, s.accuracy_meters,
                   s.status, s.created_at, s.resolved_at, u.email AS resident_email
        ";
        $from = "
            FROM emergency_sos s
            JOIN users u ON s.resident_id = u.id
        ";
        $whereActive = "(s.status IN ('TRIGGERED', 'ACKNOWLEDGED', 'RESPONDERS_DISPATCHED'))";

        $filter = $this->buildActiveFilters($filters);
        $where = [ $whereActive ];
        if ($filter['where'] !== '') {
            $where[] = $filter['where'];
        }
        $whereClause = ' WHERE ' . implode(' AND ', $where);
        $params = $filter['params'];
        $order = ' ORDER BY s.created_at ASC';

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
     * Predicate SQL + named params for the active-board filters. Only recognized
     * values are emitted (fail-closed). Native prepares cannot reuse a named
     * placeholder, so each LIKE operand gets its own bound name.
     *
     * @return array{ where: string, params: array<string, string> }
     */
    private function buildActiveFilters(array $filters): array
    {
        $parts = [];
        $params = [];

        $q = isset($filters['q']) ? trim((string) $filters['q']) : '';
        if ($q !== '' && mb_strlen($q) <= 120) {
            $parts[] = '(s.sos_code LIKE :q_code OR u.email LIKE :q_email OR s.emergency_type LIKE :q_type)';
            $needle = '%' . $q . '%';
            $params[':q_code'] = $needle;
            $params[':q_email'] = $needle;
            $params[':q_type'] = $needle;
        }

        $type = isset($filters['type']) ? strtoupper(trim((string) $filters['type'])) : '';
        if ($type !== '' && in_array($type, self::ALLOWED_TYPES, true)) {
            $parts[] = 's.emergency_type = :type';
            $params[':type'] = $type;
        }

        return ['where' => $parts === [] ? '' : implode(' AND ', $parts), 'params' => $params];
    }

    /**
     * Staff/Admin advance an SOS through the dispatch lifecycle.
     *
     * Dispatch is performed physically/offline by the Barangay (the duty desk
     * calls the responder unit); this method simply records that outcome here.
     * When the staff logs RESPONDERS_DISPATCHED a row is written to
     * emergency_dispatch_logs (responder team + notes + acting staff). When the
     * incident is RESOLVED (or FALSE_ALARM) the terminator stamps resolved_at
     * and backfills clearance_time on the latest dispatch log.
     *
     * @param string      $sosId        Emergency SOS row id.
     * @param string      $newStatus    Target status (ACKNOWLEDGED | RESPONDERS_DISPATCHED | RESOLVED | FALSE_ALARM).
     * @param string      $staffId      Acting Staff/Admin user UUID.
     * @param string|null $responderTeam Optional responder team label (e.g. 'Health Center (on-call)').
     * @param string|null $actionNotes  Optional note describing the physical dispatch / outcome.
     * @return array{ sos: array, dispatch_log: array|null } Updated SOS + latest dispatch log.
     * @throws InvalidArgumentException On missing/invalid status or unknown SOS.
     */
    public function updateSosStatus(
        string $sosId,
        string $newStatus,
        string $staffId,
        ?string $responderTeam = null,
        ?string $actionNotes = null
    ): array {
        $newStatus = strtoupper(trim($newStatus));
        if (!in_array($newStatus, self::ALLOWED_TRANSITIONS, true) || $newStatus === 'TRIGGERED') {
            throw new InvalidArgumentException('Invalid SOS target status.');
        }
        $team = $responderTeam !== null ? trim($responderTeam) : '';

        $this->pdo->beginTransaction();
        try {
            $stmtSel = $this->pdo->prepare('
                SELECT id, sos_code, status, resident_id
                FROM emergency_sos WHERE id = :id FOR UPDATE
            ');
            $stmtSel->execute([':id' => $sosId]);
            $sos = $stmtSel->fetch();
            if (!$sos) {
                $this->pdo->rollBack();
                throw new InvalidArgumentException('Emergency report not found.');
            }

            // Remember if this turns the incident into a terminal state.
            $terminal = in_array($newStatus, ['RESOLVED', 'FALSE_ALARM'], true);

            $notes = $actionNotes !== null ? trim($actionNotes) : '';
            $notes = $notes !== '' ? $notes : null;

            $stmtUpd = $this->pdo->prepare('
                UPDATE emergency_sos
                SET status = :status, resolved_at = IF(:terminal = 1, NOW(), resolved_at)
                WHERE id = :id
            ');
            $stmtUpd->execute([
                ':status' => $newStatus,
                ':terminal' => $terminal ? 1 : 0,
                ':id' => $sosId,
            ]);

            $dispatchId = null;
            if ($newStatus === 'RESPONDERS_DISPATCHED') {
                // Physical dispatch performed by the Barangay; log which unit was notified.
                $team = $team !== '' ? $team : $sos['sos_code'] . ' responder';
                $dispatchId = Uuid::v4();
                $ins = $this->pdo->prepare('
                    INSERT INTO emergency_dispatch_logs
                        (id, emergency_id, responder_team, dispatched_by, dispatch_time, arrival_time, clearance_time, action_notes)
                    VALUES
                        (:id, :eid, :team, :by, NOW(), NULL, NULL, :notes)
                ');
                $ins->execute([
                    ':id' => $dispatchId,
                    ':eid' => $sosId,
                    ':team' => $team,
                    ':by' => $staffId,
                    ':notes' => $notes ?? 'Responders dispatched (offline) — staff updated the queue.' ,
                ]);
            }

            if ($terminal) {
                // Stamp clearance on the most recent dispatch log for this incident.
                $clear = $this->pdo->prepare('
                    UPDATE emergency_dispatch_logs
                    SET clearance_time = NOW()
                    WHERE emergency_id = :eid
                      AND clearance_time IS NULL
                      AND id = (SELECT id FROM (
                          SELECT id FROM emergency_dispatch_logs
                          WHERE emergency_id = :eid2 AND clearance_time IS NULL
                          ORDER BY dispatch_time DESC LIMIT 1
                      ) tmp)
                ');
                $clear->execute([':eid' => $sosId, ':eid2' => $sosId]);
            }

            $this->pdo->commit();
        } catch (Exception $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        Logger::audit($staffId, 'UPDATE_SOS_STATUS', 'emergency_sos', $sosId, [
            'previous_status' => $sos['status'],
        ], [
            'new_status' => $newStatus,
            'responder_team' => $team !== '' ? $team : null,
            'action_notes' => $notes,
        ]);

        return [
            'sos' => $this->getById($sosId),
            'dispatch_log' => $dispatchId !== null ? $this->getDispatchLog($dispatchId) : null,
        ];
    }

    /**
     * Fetch a single SOS row by primary key (for returning post-update state).
     */
    public function getById(string $sosId): ?array
    {
        $stmt = $this->pdo->prepare('
            SELECT s.id, s.sos_code, s.emergency_type, s.latitude, s.longitude, s.accuracy_meters,
                   s.status, s.created_at, s.resolved_at, u.email AS resident_email
            FROM emergency_sos s
            JOIN users u ON s.resident_id = u.id
            WHERE s.id = :id
            LIMIT 1
        ');
        $stmt->execute([':id' => $sosId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Read a single dispatch log entry by id.
     */
    public function getDispatchLog(string $logId): ?array
    {
        $stmt = $this->pdo->prepare('
            SELECT l.id, l.emergency_id, l.responder_team, l.dispatched_by,
                   l.dispatch_time, l.arrival_time, l.clearance_time, l.action_notes,
                   u.email AS dispatched_by_email
            FROM emergency_dispatch_logs l
            JOIN users u ON l.dispatched_by = u.id
            WHERE l.id = :id
            LIMIT 1
        ');
        $stmt->execute([':id' => $logId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Staff: show the (offline) dispatch thread recorded for a given SOS.
     */
    public function listDispatchLogs(string $sosId): array
    {
        $stmt = $this->pdo->prepare('
            SELECT l.id, l.emergency_id, l.responder_team, l.dispatched_by,
                   l.dispatch_time, l.arrival_time, l.clearance_time, l.action_notes,
                   u.email AS dispatched_by_email
            FROM emergency_dispatch_logs l
            JOIN users u ON l.dispatched_by = u.id
            WHERE l.emergency_id = :eid
            ORDER BY l.dispatch_time ASC
        ');
        $stmt->execute([':eid' => $sosId]);
        return $stmt->fetchAll();
    }
}
