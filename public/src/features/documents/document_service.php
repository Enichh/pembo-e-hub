<?php

declare(strict_types=1);

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/logger.php';
require_once __DIR__ . '/../../lib/file_uploader.php';
require_once __DIR__ . '/../../lib/notification_service.php';

class DocumentService {
    private PDO $pdo;
    private NotificationService $notifier;

    public function __construct(?PDO $pdo = null, ?NotificationService $notifier = null) {
        $this->pdo = $pdo ?? Database::getConnection();
        $this->notifier = $notifier ?? new NotificationService();
    }

    public function generateUuid(): string {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    public function generateTrackingNumber(): string {
        return 'PEM-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
    }

    /**
     * Auto-generate a unique Official Receipt (OR) number for today.
     *
     * Format: OR-YYYYMMDD-#### where #### is the next sequential counter for
     * the current day (derived from the count of existing ORs sharing the
     * day's prefix). Retries against the unique index to remain collision-safe
     * under concurrency.
     *
     * @return string
     */
    public function generateReceiptNumber(): string {
        $prefix = 'OR-' . date('Ymd') . '-';
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $stmt = $this->pdo->prepare(
                'SELECT COUNT(*) FROM over_the_counter_payments WHERE official_receipt_number LIKE :prefix'
            );
            $stmt->execute([':prefix' => $prefix . '%']);
            $count = (int) $stmt->fetchColumn();
            // Index the counter from the attempt offset to dodge races + already-burned numbers.
            $candidate = $prefix . str_pad((string) ($count + 1 + $attempt), 4, '0', STR_PAD_LEFT);

            $chk = $this->pdo->prepare('SELECT id FROM over_the_counter_payments WHERE official_receipt_number = :or');
            $chk->execute([':or' => $candidate]);
            if (!$chk->fetch()) {
                return $candidate;
            }
        }
        // Ultra-unlikely fallback: append a short random suffix.
        return $prefix . strtoupper(bin2hex(random_bytes(2)));
    }

    public function getDocumentTypes(): array {
        $stmt = $this->pdo->query("SELECT id, name, base_fee, processing_days FROM document_types WHERE is_active = 1 ORDER BY id ASC");
        return $stmt->fetchAll();
    }

    public function createRequest(string $residentId, int $documentTypeId, string $purpose, ?array $uploadedFile = null): array {
        $purpose = trim($purpose);
        if (empty($purpose)) {
            throw new InvalidArgumentException("Purpose of request is required.");
        }
        if (mb_strlen($purpose) > 500) {
            throw new InvalidArgumentException("Purpose of request must be 500 characters or fewer.");
        }

        $stmtType = $this->pdo->prepare("SELECT id, name, base_fee FROM document_types WHERE id = :id AND is_active = 1");
        $stmtType->execute([':id' => $documentTypeId]);
        $docType = $stmtType->fetch();
        if (!$docType) {
            throw new InvalidArgumentException("Selected document type does not exist or is inactive.");
        }

        $requestId = $this->generateUuid();
        $trackingNumber = $this->generateTrackingNumber();

        if ($uploadedFile === null || empty($uploadedFile['tmp_name'])) {
            throw new InvalidArgumentException("Supporting document / Valid ID is required.");
        }
        $attachmentData = FileUploader::store($uploadedFile);

        $this->pdo->beginTransaction();
        try {
            $stmtInsert = $this->pdo->prepare("
                INSERT INTO document_requests (id, tracking_number, resident_id, document_type_id, purpose, status, created_at, updated_at)
                VALUES (:id, :tracking, :resident_id, :doc_type_id, :purpose, 'PENDING', NOW(), NOW())
            ");
            $stmtInsert->execute([
                ':id' => $requestId,
                ':tracking' => $trackingNumber,
                ':resident_id' => $residentId,
                ':doc_type_id' => $documentTypeId,
                ':purpose' => $purpose
            ]);

            $stmtHist = $this->pdo->prepare("
                INSERT INTO request_status_history (id, request_id, previous_status, new_status, remarks, changed_by, created_at)
                VALUES (:id, :request_id, NULL, 'PENDING', 'Document request submitted by resident.', :changed_by, NOW())
            ");
            $stmtHist->execute([
                ':id' => $this->generateUuid(),
                ':request_id' => $requestId,
                ':changed_by' => $residentId
            ]);

            $attachmentId = $this->generateUuid();
            $stmtAttach = $this->pdo->prepare("
                INSERT INTO request_attachments (id, request_id, file_name, file_path, file_size_bytes, mime_type, uploaded_at)
                VALUES (:id, :request_id, :file_name, :file_path, :file_size_bytes, :mime_type, NOW())
            ");
            $stmtAttach->execute([
                ':id' => $attachmentId,
                ':request_id' => $requestId,
                ':file_name' => $attachmentData['original_name'],
                ':file_path' => $attachmentData['storage_path'],
                ':file_size_bytes' => $attachmentData['file_size'],
                ':mime_type' => $attachmentData['mime_type']
            ]);

            Logger::audit($residentId, 'CREATE_DOCUMENT_REQUEST', 'document_requests', $requestId, null, [
                'tracking_number' => $trackingNumber,
                'document_type' => $docType['name'],
                'has_attachment' => true
            ]);

            $this->pdo->commit();

            return [
                'id' => $requestId,
                'tracking_number' => $trackingNumber,
                'document_type' => $docType['name'],
                'base_fee' => $docType['base_fee'],
                'status' => 'PENDING'
            ];
        } catch (Exception $e) {
            $this->pdo->rollBack();
            if (file_exists($attachmentData['storage_path'])) {
                @unlink($attachmentData['storage_path']);
            }
            throw $e;
        }
    }

    public function getRequestById(string $requestId, array $currentUser): array {
        $stmt = $this->pdo->prepare("
            SELECT r.id, r.tracking_number, r.resident_id, r.document_type_id, dt.name AS document_name, 
                   dt.base_fee, r.purpose, r.status, r.rejection_reason, r.digital_document_url, 
                   r.assigned_staff_id, r.created_at, r.updated_at,
                   u.email AS resident_email,
                   p.official_receipt_number, p.amount_paid, p.payment_status, p.paid_at
            FROM document_requests r
            JOIN document_types dt ON r.document_type_id = dt.id
            JOIN users u ON r.resident_id = u.id
            LEFT JOIN over_the_counter_payments p ON r.id = p.request_id
            WHERE r.id = :id
        ");
        $stmt->execute([':id' => $requestId]);
        $request = $stmt->fetch();

        if (!$request) {
            throw new InvalidArgumentException("Document request not found.");
        }

        $role = strtoupper($currentUser['role_name'] ?? '');
        if ($role === 'RESIDENT' && $request['resident_id'] !== $currentUser['id']) {
            throw new RuntimeException("Access denied. You can only view your own document requests.");
        }

        $stmtAttach = $this->pdo->prepare("SELECT id, file_name, file_size_bytes, mime_type, uploaded_at FROM request_attachments WHERE request_id = :req_id");
        $stmtAttach->execute([':req_id' => $requestId]);
        $request['attachments'] = $stmtAttach->fetchAll();

        $stmtHistory = $this->pdo->prepare("
            SELECT h.id, h.previous_status, h.new_status, h.remarks, h.created_at, u.email AS changed_by_email, r.name AS changed_by_role
            FROM request_status_history h
            JOIN users u ON h.changed_by = u.id
            JOIN roles r ON u.role_id = r.id
            WHERE h.request_id = :req_id
            ORDER BY h.created_at ASC
        ");
        $stmtHistory->execute([':req_id' => $requestId]);
        $request['status_history'] = $stmtHistory->fetchAll();

        return $request;
    }

    /**
     * Resolve an attachment so its stored file can be served only to an
     * authorized viewer (the owning resident, or any staff/admin).
     *
     * @throws InvalidArgumentException when the attachment is missing or its file is gone.
     * @throws RuntimeException when the caller may not view this request's attachment.
     */
    public function getAttachmentToServe(string $attachmentId, array $currentUser): array {
        $stmt = $this->pdo->prepare("
            SELECT a.id, a.file_name, a.mime_type, a.file_path, r.resident_id
            FROM request_attachments a
            JOIN document_requests r ON a.request_id = r.id
            WHERE a.id = :id
        ");
        $stmt->execute([':id' => $attachmentId]);
        $attachment = $stmt->fetch();

        if (!$attachment) {
            throw new InvalidArgumentException("Attachment not found.");
        }

        $role = strtoupper($currentUser['role_name'] ?? '');
        $isStaff = in_array($role, ['STAFF', 'ADMIN'], true);
        $isOwner = $attachment['resident_id'] === $currentUser['id'];

        // Owner-based authorization: resident may see their own; staff/admin may see all.
        if (!$isStaff && !$isOwner) {
            throw new RuntimeException("Access denied. You are not allowed to view this attachment.");
        }

        if (!is_file($attachment['file_path'])) {
            throw new InvalidArgumentException("The attachment file is no longer available on the server.");
        }

        return [
            'file_path' => $attachment['file_path'],
            'file_name' => $attachment['file_name'],
            'mime_type' => $attachment['mime_type'],
        ];
    }

    /**
     * Allowed document lifecycle statuses.
     */
    private const ALLOWED_LIST_STATUSES = [
        'PENDING', 'VERIFYING', 'APPROVED', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED', 'CANCELLED',
    ];

    /**
     * Staff/admin queue listing that may be narrowed by server-side filters and
     * paginated with an envelope { data, meta }. Optional $filters keys:
     *   - 'q'       string  free-text across tracking_number / resident email / document name
     *   - 'status'  string  exact status (see ALLOWED_LIST_STATUSES)
     *   - 'payment' string  'PAID' | 'UNPAID' (UNPAID = no over-the-counter row yet)
     *
     * The resident slice is untouched: it keeps returning only the caller's own
     * requests and never receives filters (residents have no triage view).
     */
    public function listRequests(array $currentUser, int $page = 0, int $perPage = 0, array $filters = []): array {
        $role = strtoupper($currentUser['role_name'] ?? '');
        $paginate = $page > 0 && $perPage > 0;

        if ($role === 'RESIDENT') {
            return $this->listResidentRequests($currentUser['id'], $page, $perPage);
        }

        return $this->listStaffRequests($page, $perPage, $filters, $paginate);
    }

    private function listResidentRequests(string $residentId, int $page, int $perPage): array {
        $baseSelect = "
            SELECT r.id, r.tracking_number, dt.name AS document_name, dt.base_fee, r.status, r.created_at,
                   p.payment_status, p.official_receipt_number
        ";
        $baseFrom = "
            FROM document_requests r
            JOIN document_types dt ON r.document_type_id = dt.id
            LEFT JOIN over_the_counter_payments p ON r.id = p.request_id
        ";
        $order = " ORDER BY r.created_at DESC";
        $paginate = $page > 0 && $perPage > 0;

        if (!$paginate) {
            $stmt = $this->pdo->prepare($baseSelect . $baseFrom . " WHERE r.resident_id = :resident_id" . $order);
            $stmt->execute([':resident_id' => $residentId]);
            return $stmt->fetchAll();
        }

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM document_requests WHERE resident_id = :resident_id");
        $countStmt->execute([':resident_id' => $residentId]);
        $total = (int)$countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt = $this->pdo->prepare(
            $baseSelect . $baseFrom . " WHERE r.resident_id = :resident_id" . $order . " LIMIT :limit OFFSET :offset"
        );
        $stmt->bindValue(':resident_id', $residentId);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return [
            'data' => $stmt->fetchAll(),
            'meta' => $this->pageMeta($total, $page, $perPage),
        ];
    }

    /**
     * Build the staff WHERE clause + named params for the supplied filters.
     * Only recognized, valid values become predicates (fail-closed: anything
     * unrecognized is dropped rather than reaching the SQL builder).
     *
     * @return array{ where: string, params: array<string, string> }
     */
    private function buildStaffFilterWhere(array $filters): array {
        $where = '';
        $params = [];

        $q = isset($filters['q']) ? trim((string)$filters['q']) : '';
        if ($q !== '' && mb_strlen($q) <= 120) {
            $needle = '%' . $q . '%';
            // Native prepares cannot reuse a named placeholder, so give each
            // LIKE operand its own name (same value).
            $where .= " (r.tracking_number LIKE :q_tracking OR u.email LIKE :q_email OR dt.name LIKE :q_name)";
            $params[':q_tracking'] = $needle;
            $params[':q_email'] = $needle;
            $params[':q_name'] = $needle;
        }

        $status = isset($filters['status']) ? strtoupper(trim((string)$filters['status'])) : '';
        if ($status !== '' && in_array($status, self::ALLOWED_LIST_STATUSES, true)) {
            $where .= ($where === '' ? '' : ' AND') . " r.status = :status";
            $params[':status'] = $status;
        }

        $payment = isset($filters['payment']) ? strtoupper(trim((string)$filters['payment'])) : '';
        if ($payment === 'PAID') {
            $where .= ($where === '' ? '' : ' AND') . " p.payment_status = 'PAID'";
        } elseif ($payment === 'UNPAID') {
            $where .= ($where === '' ? '' : ' AND') . " p.request_id IS NULL";
        }

        return ['where' => $where, 'params' => $params];
    }

    private function listStaffRequests(int $page, int $perPage, array $filters, bool $paginate): array {
        $select = "
            SELECT r.id, r.tracking_number, u.email AS resident_email, dt.name AS document_name,
                   dt.base_fee, r.status, r.created_at, p.payment_status, p.official_receipt_number
        ";
        $from = "
            FROM document_requests r
            JOIN users u ON r.resident_id = u.id
            JOIN document_types dt ON r.document_type_id = dt.id
            LEFT JOIN over_the_counter_payments p ON r.id = p.request_id
        ";
        $order = " ORDER BY r.created_at DESC";

        $filter = $this->buildStaffFilterWhere($filters);
        $where = $filter['where'] === '' ? '' : ' WHERE' . $filter['where'];
        $params = $filter['params'];

        if (!$paginate) {
            $stmt = $this->pdo->prepare($select . $from . $where . $order);
            $stmt->execute($params);
            return $stmt->fetchAll();
        }

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) " . $from . $where);
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        // LIMIT/OFFSET are bound as ints (native prepares) so they must use bindValue.
        $stmt = $this->pdo->prepare($select . $from . $where . $order . " LIMIT :limit OFFSET :offset");
        foreach ($filter['params'] as $k => $v) { $stmt->bindValue($k, $v); }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return [
            'data' => $stmt->fetchAll(),
            'meta' => $this->pageMeta($total, $page, $perPage),
        ];
    }

    /**
     * Shape the standard pagination envelope used across list slices.
     */
    private function pageMeta(int $total, int $page, int $perPage): array {
        return [
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'total_pages' => (int)ceil($total / $perPage),
        ];
    }

    /**
     * Resolve the resident's email, first name, and document name for a request
     * so a status/payment notification can be addressed. Returns null when the
     * request or its resident cannot be resolved (notification is then skipped).
     *
     * @return array{email:string, first_name:string, tracking_number:string, document_name:string}|null
     */
    private function residentForNotification(string $requestId): ?array {
        $stmt = $this->pdo->prepare('
            SELECT u.email, p.first_name, r.tracking_number, dt.name AS document_name
            FROM document_requests r
            JOIN users u ON r.resident_id = u.id
            LEFT JOIN resident_profiles p ON p.user_id = r.resident_id
            JOIN document_types dt ON r.document_type_id = dt.id
            WHERE r.id = :id
        ');
        $stmt->execute([':id' => $requestId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function updateStatus(string $requestId, string $newStatus, ?string $remarks, ?string $rejectionReason, string $staffId): array {
        $allowedStatuses = ['PENDING', 'VERIFYING', 'APPROVED', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED', 'CANCELLED'];
        $newStatus = strtoupper(trim($newStatus));

        if (!in_array($newStatus, $allowedStatuses, true)) {
            throw new InvalidArgumentException("Invalid status value provided.");
        }

        $this->pdo->beginTransaction();
        try {
            $stmtSelect = $this->pdo->prepare("SELECT id, status, resident_id FROM document_requests WHERE id = :id FOR UPDATE");
            $stmtSelect->execute([':id' => $requestId]);
            $currentReq = $stmtSelect->fetch();

            if (!$currentReq) {
                throw new InvalidArgumentException("Document request not found.");
            }

            $previousStatus = $currentReq['status'];

            $stmtUpdate = $this->pdo->prepare("
                UPDATE document_requests 
                SET status = :status, rejection_reason = :rejection_reason, assigned_staff_id = :staff_id, updated_at = NOW()
                WHERE id = :id
            ");
            $stmtUpdate->execute([
                ':status' => $newStatus,
                ':rejection_reason' => $newStatus === 'REJECTED' ? $rejectionReason : null,
                ':staff_id' => $staffId,
                ':id' => $requestId
            ]);

            $stmtHist = $this->pdo->prepare("
                INSERT INTO request_status_history (id, request_id, previous_status, new_status, remarks, changed_by, created_at)
                VALUES (:id, :request_id, :prev_status, :new_status, :remarks, :changed_by, NOW())
            ");
            $stmtHist->execute([
                ':id' => $this->generateUuid(),
                ':request_id' => $requestId,
                ':prev_status' => $previousStatus,
                ':new_status' => $newStatus,
                ':remarks' => $remarks ?: "Status changed from {$previousStatus} to {$newStatus}.",
                ':changed_by' => $staffId
            ]);

            Logger::audit($staffId, 'UPDATE_DOCUMENT_STATUS', 'document_requests', $requestId, [
                'previous_status' => $previousStatus
            ], [
                'new_status' => $newStatus,
                'remarks' => $remarks,
                'rejection_reason' => $rejectionReason
            ]);

            $this->pdo->commit();

            $resident = $this->residentForNotification($requestId);
            if ($resident !== null) {
                $this->notifier->documentStatusChanged(
                    $resident['email'],
                    $resident['first_name'] ?: '',
                    $resident['tracking_number'],
                    $resident['document_name'],
                    $newStatus,
                    $newStatus === 'REJECTED' ? $rejectionReason : null
                );
            }

            return [
                'id' => $requestId,
                'previous_status' => $previousStatus,
                'status' => $newStatus
            ];
        } catch (Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function recordPayment(string $requestId, string $officialReceiptNumber, float $amountPaid, string $cashierStaffId, ?string $remarks = null): array {
        $officialReceiptNumber = trim($officialReceiptNumber);
        // Auto-generate an OR number when the caller did not supply one (the
        // receipt must be system-issued, not hand-keyed by staff).
        if ($officialReceiptNumber === '') {
            $officialReceiptNumber = $this->generateReceiptNumber();
        }

        if ($amountPaid < 0) {
            throw new InvalidArgumentException("Amount paid must be non-negative.");
        }

        $this->pdo->beginTransaction();
        try {
            $stmtReq = $this->pdo->prepare("SELECT id, status FROM document_requests WHERE id = :id FOR UPDATE");
            $stmtReq->execute([':id' => $requestId]);
            $req = $stmtReq->fetch();

            if (!$req) {
                throw new InvalidArgumentException("Document request not found.");
            }

            $stmtCheckOR = $this->pdo->prepare("SELECT id FROM over_the_counter_payments WHERE official_receipt_number = :or_num");
            $stmtCheckOR->execute([':or_num' => $officialReceiptNumber]);
            if ($stmtCheckOR->fetch()) {
                throw new InvalidArgumentException("Official receipt number {$officialReceiptNumber} has already been recorded.");
            }

            $stmtCheckExisting = $this->pdo->prepare("SELECT id FROM over_the_counter_payments WHERE request_id = :req_id");
            $stmtCheckExisting->execute([':req_id' => $requestId]);
            if ($stmtCheckExisting->fetch()) {
                throw new InvalidArgumentException("A payment has already been recorded for this document request.");
            }

            $paymentId = $this->generateUuid();
            $stmtInsert = $this->pdo->prepare("
                INSERT INTO over_the_counter_payments (id, request_id, official_receipt_number, amount_paid, payment_status, cashier_staff_id, paid_at, remarks)
                VALUES (:id, :request_id, :or_num, :amount, 'PAID', :cashier_id, NOW(), :remarks)
            ");
            $stmtInsert->execute([
                ':id' => $paymentId,
                ':request_id' => $requestId,
                ':or_num' => $officialReceiptNumber,
                ':amount' => $amountPaid,
                ':cashier_id' => $cashierStaffId,
                ':remarks' => $remarks
            ]);

            Logger::audit($cashierStaffId, 'RECORD_PAYMENT', 'over_the_counter_payments', $paymentId, null, [
                'request_id' => $requestId,
                'official_receipt_number' => $officialReceiptNumber,
                'amount_paid' => $amountPaid
            ]);

            $this->pdo->commit();

            $resident = $this->residentForNotification($requestId);
            if ($resident !== null) {
                $this->notifier->paymentRecorded(
                    $resident['email'],
                    $resident['first_name'] ?: '',
                    $resident['tracking_number'],
                    $resident['document_name'],
                    $officialReceiptNumber,
                    number_format($amountPaid, 2)
                );
            }

            return [
                'id' => $paymentId,
                'request_id' => $requestId,
                'official_receipt_number' => $officialReceiptNumber,
                'amount_paid' => $amountPaid,
                'payment_status' => 'PAID'
            ];
        } catch (Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
