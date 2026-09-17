<?php

declare(strict_types=1);

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/logger.php';
require_once __DIR__ . '/../../lib/uuid.php';
require_once __DIR__ . '/../../lib/notification_service.php';

/**
 * Profile feature — resident profile details.
 *
 * Owns reading and updating the resident_profiles row (joined with the user's
 * email) for the authenticated resident. IDOR-safe: every query is scoped to
 * the session user id, never a client-supplied id.
 *
 * SQL lives here only, via prepared statements (project rule).
 */
class ProfileService
{
    public const ALLOWED_GENDERS = ['Male', 'Female', 'Other'];
    public const ALLOWED_CIVIL_STATUS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];

    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Database::getConnection();
    }

    /**
     * Fetch the resident's full profile (joined with email) scoped to the
     * authenticated user id. Returns null when no resident profile row exists.
     */
    public function getResidentProfile(string $residentId): ?array
    {
        $stmt = $this->pdo->prepare('
            SELECT rp.id, rp.user_id, rp.first_name, rp.middle_name, rp.last_name,
                   rp.suffix, rp.birthdate, rp.gender, rp.civil_status,
                   rp.contact_number, rp.street_address, rp.voter_status,
                   rp.verification_status, rp.id_document_path, rp.rejection_reason,
                   rp.verified_by, rp.verified_at,
                   rp.created_at, rp.updated_at,
                   u.email
            FROM resident_profiles rp
            JOIN users u ON u.id = rp.user_id
            WHERE rp.user_id = :user_id
            LIMIT 1
        ');
        $stmt->execute([':user_id' => $residentId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Update the resident's editable profile fields. Rejects anything outside
     * the allowlist and validates each field before persisting. Every write is
     * audited (immutable trail).
     *
     * @param string $residentId Authenticated resident id (IDOR-safe).
     * @param array  $fields     Allowlisted, already-shaped input.
     */
    public function updateResidentProfile(string $residentId, array $fields): array
    {
        $current = $this->getResidentProfile($residentId);
        if ($current === null) {
            throw new RuntimeException('Resident profile not found. Contact the Barangay office.');
        }

        $firstName = trim($fields['first_name'] ?? '');
        $middleName = trim($fields['middle_name'] ?? '');
        $lastName = trim($fields['last_name'] ?? '');
        $suffix = trim($fields['suffix'] ?? '');
        $birthdate = trim($fields['birthdate'] ?? '');
        $gender = trim($fields['gender'] ?? '');
        $civilStatus = trim($fields['civil_status'] ?? '');
        $contactNumber = trim($fields['contact_number'] ?? '');
        $streetAddress = trim($fields['street_address'] ?? '');
        // Preserve the existing voter status when the field is not sent
        // (the edit form no longer exposes it, so a save must not reset it).
        $voterStatus = array_key_exists('voter_status', $fields)
            ? (($fields['voter_status']) ? 1 : 0)
            : (int) $current['voter_status'];

        if ($firstName === '') {
            throw new InvalidArgumentException('First name is required.');
        }
        if (mb_strlen($firstName) > 100) {
            throw new InvalidArgumentException('First name must be 100 characters or fewer.');
        }
        if ($lastName === '') {
            throw new InvalidArgumentException('Last name is required.');
        }
        if (mb_strlen($lastName) > 100) {
            throw new InvalidArgumentException('Last name must be 100 characters or fewer.');
        }
        if ($middleName !== '' && mb_strlen($middleName) > 100) {
            throw new InvalidArgumentException('Middle name must be 100 characters or fewer.');
        }
        if ($suffix !== '' && mb_strlen($suffix) > 20) {
            throw new InvalidArgumentException('Suffix must be 20 characters or fewer.');
        }
        if ($birthdate === '') {
            throw new InvalidArgumentException('Birthdate is required.');
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthdate)) {
            throw new InvalidArgumentException('Birthdate has an invalid format.');
        }
        $birthTs = strtotime($birthdate);
        if ($birthTs === false || $birthTs > time()) {
            throw new InvalidArgumentException('Birthdate is not a valid date.');
        }
        if (!in_array($gender, self::ALLOWED_GENDERS, true)) {
            throw new InvalidArgumentException('Please select a valid gender.');
        }
        if (!in_array($civilStatus, self::ALLOWED_CIVIL_STATUS, true)) {
            throw new InvalidArgumentException('Please select a valid civil status.');
        }
        if ($contactNumber !== '' && !preg_match('/^(09|\+639)\d{9}$/', $contactNumber)) {
            throw new InvalidArgumentException('Please enter a valid Philippine mobile number (e.g. 09397325776).');
        }
        if ($streetAddress === '') {
            throw new InvalidArgumentException('Complete address is required.');
        }
        if (mb_strlen($streetAddress) > 500) {
            throw new InvalidArgumentException('Complete address must be 500 characters or fewer.');
        }

        $stmt = $this->pdo->prepare('
            UPDATE resident_profiles
            SET first_name = :first_name,
                middle_name = :middle_name,
                last_name = :last_name,
                suffix = :suffix,
                birthdate = :birthdate,
                gender = :gender,
                civil_status = :civil_status,
                contact_number = :contact_number,
                street_address = :street_address,
                voter_status = :voter_status
            WHERE user_id = :user_id
        ');
        $stmt->execute([
            ':first_name' => $firstName,
            ':middle_name' => $middleName !== '' ? $middleName : null,
            ':last_name' => $lastName,
            ':suffix' => $suffix !== '' ? $suffix : null,
            ':birthdate' => $birthdate,
            ':gender' => $gender,
            ':civil_status' => $civilStatus,
            ':contact_number' => $contactNumber,
            ':street_address' => $streetAddress,
            ':voter_status' => $voterStatus,
            ':user_id' => $residentId,
        ]);

        Logger::audit($residentId, 'UPDATE_PROFILE', 'resident_profiles', $current['id'], [
            'first_name' => $current['first_name'],
            'last_name' => $current['last_name'],
            'contact_number' => $current['contact_number'],
            'street_address' => $current['street_address'],
            'voter_status' => (int) $current['voter_status'],
        ], [
            'first_name' => $firstName,
            'last_name' => $lastName,
            'contact_number' => $contactNumber,
            'street_address' => $streetAddress,
            'voter_status' => $voterStatus,
        ]);

        $updated = $this->getResidentProfile($residentId);
        return $updated ?? [];
    }

    /**
     * Lists all pending resident verification applications for Staff/Admin review.
     *
     * @return array<int, array{id: string, user_id: string, email: string, first_name: string, last_name: string, street_address: string, birthdate: string, gender: string, verification_status: string, id_document_path: string|null, created_at: string}>
     */
    public function listPendingVerifications(): array
    {
        $stmt = $this->pdo->prepare("
            SELECT rp.id, rp.user_id, u.email, rp.first_name, rp.last_name,
                   rp.street_address, rp.birthdate, rp.gender, rp.verification_status,
                   rp.id_document_path, rp.created_at
            FROM resident_profiles rp
            JOIN users u ON u.id = rp.user_id
            WHERE rp.verification_status = 'PENDING'
            ORDER BY rp.created_at ASC
        ");
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Paginated, server-side searchable pending-verification queue for the staff
     * workbench. Keeps the existing listPendingVerifications() untouched (admin
     * still consumes the flat list) and returns the standard { data, meta }
     * envelope used across the staff list slices.
     *
     * Pending applications are offered oldest-first so the desk clears the backlog
     * fairly. Rows carry every field the inspect/review modal needs.
     *
     * @param int $page 1-based page (0 = return data without an envelope, flat array).
     * @param int $perPage Rows per page when paging.
     * @param string|null $q Optional free-text across name / email / street address.
     * @return array<int,array>|array{data:array<int,array>,meta:array} Queue rows.
     */
    public function listPendingVerificationsPaged(int $page = 0, int $perPage = 0, ?string $q = null): array
    {
        $fields = "
            SELECT rp.id, rp.user_id, u.email, rp.first_name, rp.middle_name, rp.last_name,
                   rp.suffix, rp.birthdate, rp.gender, rp.civil_status, rp.street_address,
                   rp.verification_status, rp.id_document_path, rp.created_at
        ";
        $from = "
            FROM resident_profiles rp
            JOIN users u ON u.id = rp.user_id
            WHERE rp.verification_status = 'PENDING'";
        $order = " ORDER BY rp.created_at ASC";

        $params = [];
        if ($q !== null && trim($q) !== '') {
            $term = trim($q);
            // Native prepares reject reused named placeholders: each LIKE operand
            // gets a distinct name (:q1..:q5). All are bound to the same LIKE term.
            $cols = ['rp.first_name', 'rp.middle_name', 'rp.last_name', 'u.email', 'rp.street_address'];
            $expr = [];
            foreach ($cols as $i => $col) {
                $key = ':q' . ($i + 1);
                $expr[] = $col . ' LIKE ' . $key;
                $params[$key] = '%' . $term . '%';
            }
            $from .= ' AND (' . implode(' OR ', $expr) . ')';
        }

        $paginate = $page > 0 && $perPage > 0;

        if (!$paginate) {
            $stmt = $this->pdo->prepare($fields . $from . $order);
            foreach ($params as $k => $v) { $stmt->bindValue($k, $v); }
            $stmt->execute();
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) " . $from);
        foreach ($params as $k => $v) { $countStmt->bindValue($k, $v); }
        $countStmt->execute();
        $total = (int)$countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt = $this->pdo->prepare($fields . $from . $order . " LIMIT :limit OFFSET :offset");
        foreach ($params as $k => $v) { $stmt->bindValue($k, $v); }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return [
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'meta' => $this->verificationPageMeta($total, $page, $perPage),
        ];
    }

    /** Shape the standard pagination envelope reused across staff list slices. */
    private function verificationPageMeta(int $total, int $page, int $perPage): array
    {
        return [
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'total_pages' => (int)ceil($total / $perPage),
        ];
    }

    /**
     * Staff/Admin manually approves or rejects a resident account application.
     *
     * @param string $targetUserId Target resident user UUID.
     * @param string $newStatus Target status ('VERIFIED' or 'REJECTED').
     * @param string|null $rejectionReason Optional reason if rejected.
     * @param string $staffUserId Performing staff/admin UUID.
     * @return array{user_id: string, verification_status: string} Updated verification state.
     * @throws InvalidArgumentException On invalid status or missing reason for rejection.
     */
    public function verifyResidentAccount(
        string $targetUserId,
        string $newStatus,
        ?string $rejectionReason,
        string $staffUserId
    ): array {
        $newStatus = strtoupper(trim($newStatus));
        if (!in_array($newStatus, ['VERIFIED', 'REJECTED'], true)) {
            throw new InvalidArgumentException("Status must be either 'VERIFIED' or 'REJECTED'.");
        }

        $rejectionReason = trim($rejectionReason ?? '');
        if ($newStatus === 'REJECTED' && $rejectionReason === '') {
            throw new InvalidArgumentException("A rejection reason is required when rejecting an application.");
        }

        $current = $this->getResidentProfile($targetUserId);
        if ($current === null) {
            throw new InvalidArgumentException("Resident account not found.");
        }

        $stmt = $this->pdo->prepare("
            UPDATE resident_profiles
            SET verification_status = :status,
                rejection_reason = :reason,
                verified_by = :staff_id,
                verified_at = NOW(),
                updated_at = NOW()
            WHERE user_id = :user_id
        ");
        $stmt->execute([
            ':status'   => $newStatus,
            ':reason'   => $newStatus === 'REJECTED' ? $rejectionReason : null,
            ':staff_id' => $staffUserId,
            ':user_id'  => $targetUserId,
        ]);

        Logger::audit($staffUserId, 'VERIFY_RESIDENT_ACCOUNT', 'resident_profiles', $current['id'], [
            'previous_status' => $current['verification_status'] ?? 'PENDING',
        ], [
            'new_status' => $newStatus,
            'reason'     => $rejectionReason,
        ]);

        // Send email notification to resident
        $notifier = new NotificationService();

        if ($newStatus === 'VERIFIED') {
            $notifier->applicationApproved($current['email'], $current['first_name']);
        } else if ($newStatus === 'REJECTED') {
            $notifier->applicationRejected($current['email'], $current['first_name'], $rejectionReason);
        }

        return [
            'user_id'             => $targetUserId,
            'verification_status' => $newStatus,
        ];
    }

    /**
     * Requirement 1.3.2, 1.3.3: Centralized resident directory search for Staff/Admin.
     *
     * @param string|null $query Search term.
     * @return array<int, array>
     */
    public function listResidentDirectory(?string $query = null): array
    {
        $sql = "
            SELECT rp.id, rp.user_id, u.email, u.is_active, rp.first_name, rp.middle_name, rp.last_name,
                   rp.suffix, rp.birthdate, rp.gender, rp.civil_status, rp.contact_number,
                   rp.street_address, rp.voter_status, rp.verification_status, rp.id_document_path, rp.created_at
            FROM resident_profiles rp
            JOIN users u ON u.id = rp.user_id
            WHERE u.role_id = 3
        ";

        if ($query !== null && trim($query) !== '') {
            $sql .= " AND (rp.first_name LIKE :q OR rp.last_name LIKE :q OR u.email LIKE :q OR rp.street_address LIKE :q)";
        }

        $sql .= " ORDER BY rp.last_name ASC, rp.first_name ASC";

        $stmt = $this->pdo->prepare($sql);
        if ($query !== null && trim($query) !== '') {
            $stmt->bindValue(':q', '%' . trim($query) . '%');
        }
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
