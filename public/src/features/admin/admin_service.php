<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/uuid.php';

/**
 * Administrative Service Slice
 *
 * Manages system-wide audit logging, staff account provisioning, and user administration.
 *
 * @package PemboEHub\Features\Admin
 */
class AdminService {
    private PDO $pdo;

    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
    }

    /**
     * Lists system audit logs with limit and pagination offset.
     *
     * @param int $limit Max logs to retrieve (1-100).
     * @param int $offset Offset for pagination.
     * @return array<int, array{id: int, user_id: string|null, user_email: string|null, role_name: string|null, ip_address: string, user_agent: string, action: string, table_name: string, record_id: string|null, old_values: string|null, new_values: string|null, timestamp: string}>
     */
    public function listAuditLogs(int $limit = 50, int $offset = 0): array {
        $limit = max(1, min($limit, 100));
        $offset = max(0, $offset);

        $sql = "
            SELECT 
                a.id,
                a.user_id,
                u.email AS user_email,
                r.name AS role_name,
                a.ip_address,
                a.user_agent,
                a.action,
                a.table_name,
                a.record_id,
                a.old_values,
                a.new_values,
                a.timestamp
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN roles r ON u.role_id = r.id
            ORDER BY a.timestamp DESC, a.id DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Lists all registered staff members.
     *
     * @return array<int, array{user_id: string, email: string, is_active: int, last_login_at: string|null, created_at: string, profile_id: string, first_name: string, last_name: string, department: string, position: string}>
     */
    public function listStaffUsers(): array {
        $sql = "
            SELECT 
                u.id AS user_id,
                u.email,
                u.is_active,
                u.last_login_at,
                u.created_at,
                sp.id AS profile_id,
                sp.first_name,
                sp.last_name,
                sp.department,
                sp.position
            FROM users u
            JOIN staff_profiles sp ON u.id = sp.user_id
            WHERE u.role_id = 2
            ORDER BY sp.last_name ASC, sp.first_name ASC
        ";

        $stmt = $this->pdo->query($sql);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Creates a new staff user account and staff profile.
     *
     * @param string $email Staff email address.
     * @param string $password Initial staff password (min 8 chars).
     * @param string $firstName Staff first name.
     * @param string $lastName Staff last name.
     * @param string $department Staff department assignment.
     * @param string $position Staff official title/position.
     * @param string|null $adminUserId Operating Admin user UUID for audit logging.
     * @return array{user_id: string, email: string, first_name: string, last_name: string, department: string, position: string} Created staff details.
     * @throws InvalidArgumentException If validation fails or email exists.
     * @throws RuntimeException If role configuration missing or DB insert fails.
     */
    public function createStaffUser(
        string $email,
        string $password,
        string $firstName,
        string $lastName,
        string $department,
        string $position,
        ?string $adminUserId = null
    ): array {
        $email = trim(filter_var($email, FILTER_SANITIZE_EMAIL));
        if ($email === '' || mb_strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException("Please provide a valid email address.");
        }

        if (strlen($password) < 8 || mb_strlen($password, 'UTF-8') > 128) {
            throw new InvalidArgumentException("Password must be between 8 and 128 characters long.");
        }

        $firstName = trim($firstName);
        $lastName = trim($lastName);
        $department = trim($department);
        $position = trim($position);

        if ($firstName === '' || $lastName === '' || $department === '' || $position === '') {
            throw new InvalidArgumentException("First name, last name, department, and position are required.");
        }
        if (mb_strlen($firstName) > 100) {
            throw new InvalidArgumentException("First name must be 100 characters or fewer.");
        }
        if (!preg_match('/^[a-zA-ZñÑ\s\.\'\-]+$/u', $firstName)) {
            throw new InvalidArgumentException("First name contains invalid characters.");
        }
        if (mb_strlen($lastName) > 100) {
            throw new InvalidArgumentException("Last name must be 100 characters or fewer.");
        }
        if (!preg_match('/^[a-zA-ZñÑ\s\.\'\-]+$/u', $lastName)) {
            throw new InvalidArgumentException("Last name contains invalid characters.");
        }
        if (mb_strlen($department) > 100) {
            throw new InvalidArgumentException("Department must be 100 characters or fewer.");
        }
        if (mb_strlen($position) > 100) {
            throw new InvalidArgumentException("Position must be 100 characters or fewer.");
        }

        // Check if email already exists
        $stmtCheck = $this->pdo->prepare("SELECT id FROM users WHERE email = :email");
        $stmtCheck->execute([':email' => $email]);
        if ($stmtCheck->fetch()) {
            throw new InvalidArgumentException("Email address is already registered.");
        }

        // Get STAFF role id
        $stmtRole = $this->pdo->query("SELECT id FROM roles WHERE name = 'STAFF'");
        $roleId = (int) $stmtRole->fetchColumn();
        if (!$roleId) {
            throw new RuntimeException("Default system role 'STAFF' not found.");
        }

        $userId = Uuid::v4();
        $profileId = Uuid::v4();
        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $this->pdo->beginTransaction();
        try {
            // Insert user
            $stmtUser = $this->pdo->prepare("
                INSERT INTO users (id, role_id, email, password_hash, is_active, email_verified_at, created_at, updated_at)
                VALUES (:id, :role_id, :email, :password_hash, 1, NOW(), NOW(), NOW())
            ");
            $stmtUser->execute([
                ':id'            => $userId,
                ':role_id'       => $roleId,
                ':email'         => $email,
                ':password_hash' => $passwordHash,
            ]);

            // Insert staff profile
            $stmtProfile = $this->pdo->prepare("
                INSERT INTO staff_profiles (id, user_id, first_name, last_name, department, position, created_at, updated_at)
                VALUES (:id, :user_id, :first_name, :last_name, :department, :position, NOW(), NOW())
            ");
            $stmtProfile->execute([
                ':id'         => $profileId,
                ':user_id'    => $userId,
                ':first_name' => $firstName,
                ':last_name'  => $lastName,
                ':department' => $department,
                ':position'   => $position,
            ]);

            // Record Audit Log entry
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $agent = $_SERVER['HTTP_USER_AGENT'] ?? 'CLI/System';
            $stmtAudit = $this->pdo->prepare("
                INSERT INTO audit_logs (user_id, ip_address, user_agent, action, table_name, record_id, new_values, timestamp)
                VALUES (:user_id, :ip, :agent, 'CREATE_STAFF_ACCOUNT', 'users', :record_id, :new_values, NOW())
            ");
            $stmtAudit->execute([
                ':user_id'   => $adminUserId,
                ':ip'        => $ip,
                ':agent'     => $agent,
                ':record_id' => $userId,
                ':new_values' => json_encode([
                    'email'      => $email,
                    'department' => $department,
                    'position'   => $position,
                ]),
            ]);

            $this->pdo->commit();
        } catch (Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return [
            'user_id'    => $userId,
            'email'      => $email,
            'first_name' => $firstName,
            'last_name'  => $lastName,
            'department' => $department,
            'position'   => $position,
        ];
    }

    /**
     * Toggles staff account active status (activate / deactivate).

     *
     * @param string $staffUserId Target staff user UUID.
     * @param bool $isActive Target active state.
     * @param string|null $adminUserId Operating Admin UUID.
     * @return array{user_id: string, is_active: int} Updated status details.
     * @throws InvalidArgumentException If staff account not found or target is not a staff member.
     */
    public function toggleStaffStatus(string $staffUserId, bool $isActive, ?string $adminUserId = null): array {
        $stmtCheck = $this->pdo->prepare("SELECT id, email, role_id, is_active FROM users WHERE id = :id");
        $stmtCheck->execute([':id' => $staffUserId]);
        $user = $stmtCheck->fetch(PDO::FETCH_ASSOC);

        if (!$user || (int)$user['role_id'] !== 2) { // 2 = STAFF
            throw new InvalidArgumentException("Staff account not found.");
        }

        $newActiveInt = $isActive ? 1 : 0;

        $stmtUpd = $this->pdo->prepare("UPDATE users SET is_active = :active, updated_at = NOW() WHERE id = :id");
        $stmtUpd->execute([':active' => $newActiveInt, ':id' => $staffUserId]);

        Logger::audit($adminUserId, $isActive ? 'ACTIVATE_STAFF_ACCOUNT' : 'DEACTIVATE_STAFF_ACCOUNT', 'users', $staffUserId, [
            'is_active' => (int)$user['is_active'],
        ], [
            'is_active' => $newActiveInt,
        ]);

        return [
            'user_id'   => $staffUserId,
            'is_active' => $newActiveInt,
        ];
    }

    /**
     * Retrieves aggregated system-wide metrics for Admin overview.
     *
     * @return array{total_staff: int, active_staff: int, total_residents: int, total_audit_logs: int}
     */
    public function getAdminOverviewMetrics(): array {
        $totalStaff = (int) $this->pdo->query("SELECT COUNT(*) FROM users WHERE role_id = 2")->fetchColumn();
        $activeStaff = (int) $this->pdo->query("SELECT COUNT(*) FROM users WHERE role_id = 2 AND is_active = 1")->fetchColumn();
        $totalResidents = (int) $this->pdo->query("SELECT COUNT(*) FROM users WHERE role_id = 3")->fetchColumn();
        $totalAuditLogs = (int) $this->pdo->query("SELECT COUNT(*) FROM audit_logs")->fetchColumn();

        return [
            'total_staff'      => $totalStaff,
            'active_staff'     => $activeStaff,
            'total_residents'  => $totalResidents,
            'total_audit_logs' => $totalAuditLogs,
        ];
    }

    /**
     * Requirement 1.6.1-1.6.3: Lists all barangay inventory assets and their availability status.
     *
     * @return array<int, array{id: string, asset_tag: string, name: string, category: string, total_quantity: int, available_quantity: int, item_condition: string, storage_location: string, created_at: string}>
     */
    public function listAssets(): array {
        $sql = "
            SELECT id, asset_tag, name, category, total_quantity, available_quantity, item_condition, storage_location, created_at
            FROM assets
            ORDER BY name ASC
        ";
        $stmt = $this->pdo->query($sql);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Requirement 1.6.1: Registers a new barangay inventory asset.
     *
     * The asset tag is generated automatically as a sequential, human-readable
     * identifier (e.g. AST-1001, AST-1002, ...). Callers no longer supply a tag.
     *
     * @param string $name Item name.
     * @param string $category Item category (e.g. Medical Equipment, Office Electronics, Tents/Chairs).
     * @param int $totalQuantity Total stock quantity.
     * @param string $storageLocation Storage location/room in barangay hall.
     * @param string $condition Item condition ('NEW', 'GOOD', 'FAIR', 'DAMAGED', 'UNDER_MAINTENANCE').
     * @param string|null $adminUserId Operating Admin UUID.
     * @return array{id: string, asset_tag: string, name: string, category: string, total_quantity: int, available_quantity: int, item_condition: string, storage_location: string}
     * @throws InvalidArgumentException On invalid inputs.
     */
    public function createAsset(
        string $name,
        string $category,
        int $totalQuantity,
        string $storageLocation,
        string $condition = 'GOOD',
        ?string $adminUserId = null
    ): array {
        $name = trim($name);
        $category = trim($category);
        $storageLocation = trim($storageLocation);
        $condition = strtoupper(trim($condition));

        if ($name === '' || $category === '' || $storageLocation === '') {
            throw new InvalidArgumentException("Name, category, and storage location are required.");
        }
        if (mb_strlen($name) > 150) {
            throw new InvalidArgumentException("Item name must be 150 characters or fewer.");
        }
        if (mb_strlen($category) > 100) {
            throw new InvalidArgumentException("Category must be 100 characters or fewer.");
        }
        if (mb_strlen($storageLocation) > 150) {
            throw new InvalidArgumentException("Storage location must be 150 characters or fewer.");
        }

        $assetTag = $this->generateNextAssetTag();

        if ($totalQuantity <= 0) {
            throw new InvalidArgumentException("Total quantity must be greater than zero.");
        }

        $validConditions = ['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'UNDER_MAINTENANCE'];
        if (!in_array($condition, $validConditions, true)) {
            throw new InvalidArgumentException("Invalid item condition specified.");
        }

        $assetId = Uuid::v4();

        $stmt = $this->pdo->prepare("
            INSERT INTO assets (id, asset_tag, name, category, total_quantity, available_quantity, item_condition, storage_location, created_at, updated_at)
            VALUES (:id, :tag, :name, :category, :total_qty, :avail_qty, :condition, :location, NOW(), NOW())
        ");
        $stmt->execute([
            ':id'         => $assetId,
            ':tag'        => $assetTag,
            ':name'       => $name,
            ':category'   => $category,
            ':total_qty'  => $totalQuantity,
            ':avail_qty'  => $totalQuantity,
            ':condition'  => $condition,
            ':location'   => $storageLocation,
        ]);

        Logger::audit($adminUserId, 'CREATE_ASSET', 'assets', $assetId, null, [
            'asset_tag' => $assetTag,
            'name'      => $name,
            'total_qty' => $totalQuantity,
        ]);

        return [
            'id'                 => $assetId,
            'asset_tag'          => $assetTag,
            'name'               => $name,
            'category'           => $category,
            'total_quantity'     => $totalQuantity,
            'available_quantity' => $totalQuantity,
            'item_condition'     => $condition,
            'storage_location'  => $storageLocation,
        ];
    }

    /**
     * Generates the next sequential asset tag (e.g. AST-1001, AST-1002, ...).
     *
     * The numeric suffix is derived from the highest existing sequence number
     * for tags matching the 'AST-' prefix, so tags remain human-readable and
     * unique without requiring manual entry. Handles gaps and an empty catalog.
     *
     * @return string The next asset tag.
     */
    private function generateNextAssetTag(): string {
        $stmt = $this->pdo->query("SELECT asset_tag FROM assets WHERE asset_tag LIKE 'AST-%'");
        $max = 1000; // start at AST-1001 when no assets exist yet
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $suffix = (int) substr($row['asset_tag'], 4);
            if ($suffix > $max) {
                $max = $suffix;
            }
        }
        return 'AST-' . ($max + 1);
    }

    /**
     * Requirement 1.6.2: Issues an inventory asset item to a borrower.
     *
     * @param string $assetId Target asset UUID.
     * @param string $borrowerName Full name of borrower.
     * @param string $borrowerContact Phone number / contact.
     * @param int $quantity Quantity borrowed.
     * @param string $expectedReturnDate Expected return date (YYYY-MM-DD).
     * @param string $adminUserId Issuing staff / admin user UUID.
     * @param string|null $remarks Additional notes.
     * @return array{transaction_id: string, asset_id: string, borrower_name: string, quantity_borrowed: int, expected_return_date: string}
     * @throws InvalidArgumentException On invalid inputs or insufficient available stock.
     */
    public function issueAsset(
        string $assetId,
        string $borrowerName,
        string $borrowerContact,
        int $quantity,
        string $expectedReturnDate,
        string $adminUserId,
        ?string $remarks = null
    ): array {
        $borrowerName = trim($borrowerName);
        $borrowerContact = trim($borrowerContact);
        $expectedReturnDate = trim($expectedReturnDate);

        if ($borrowerName === '' || $borrowerContact === '' || $expectedReturnDate === '') {
            throw new InvalidArgumentException("Borrower details and expected return date are required.");
        }
        if (mb_strlen($borrowerName) > 150) {
            throw new InvalidArgumentException("Borrower name must be 150 characters or fewer.");
        }
        if (!preg_match('/^(09|\+639)\d{9}$/', $borrowerContact)) {
            throw new InvalidArgumentException("Please enter a valid Philippine mobile number (e.g. 09397325776).");
        }
        if ($remarks !== null && mb_strlen($remarks) > 500) {
            throw new InvalidArgumentException("Remarks must be 500 characters or fewer.");
        }

        if ($quantity <= 0) {
            throw new InvalidArgumentException("Quantity borrowed must be greater than zero.");
        }

        $this->pdo->beginTransaction();
        try {
            $stmtAsset = $this->pdo->prepare("SELECT id, name, available_quantity FROM assets WHERE id = :id FOR UPDATE");
            $stmtAsset->execute([':id' => $assetId]);
            $asset = $stmtAsset->fetch(PDO::FETCH_ASSOC);

            if (!$asset) {
                throw new InvalidArgumentException("Asset record not found.");
            }

            $avail = (int) $asset['available_quantity'];
            if ($quantity > $avail) {
                throw new InvalidArgumentException("Insufficient available stock. Only {$avail} item(s) currently available.");
            }

            $newAvail = $avail - $quantity;
            $stmtUpd = $this->pdo->prepare("UPDATE assets SET available_quantity = :avail, updated_at = NOW() WHERE id = :id");
            $stmtUpd->execute([':avail' => $newAvail, ':id' => $assetId]);

            $txId = Uuid::v4();
            $stmtTx = $this->pdo->prepare("
                INSERT INTO asset_transactions (id, asset_id, borrower_name, borrower_contact, quantity_borrowed, issued_by, issued_at, expected_return_date, transaction_status, remarks)
                VALUES (:id, :asset_id, :borrower_name, :contact, :qty, :issued_by, NOW(), :return_date, 'BORROWED', :remarks)
            ");
            $stmtTx->execute([
                ':id'            => $txId,
                ':asset_id'      => $assetId,
                ':borrower_name' => $borrowerName,
                ':contact'       => $borrowerContact,
                ':qty'           => $quantity,
                ':issued_by'     => $adminUserId,
                ':return_date'   => $expectedReturnDate,
                ':remarks'       => $remarks,
            ]);

            Logger::audit($adminUserId, 'ISSUE_ASSET', 'asset_transactions', $txId, null, [
                'asset_id'      => $assetId,
                'borrower_name' => $borrowerName,
                'qty'           => $quantity,
            ]);

            $this->pdo->commit();
        } catch (Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return [
            'transaction_id'       => $txId,
            'asset_id'             => $assetId,
            'borrower_name'        => $borrowerName,
            'quantity_borrowed'    => $quantity,
            'expected_return_date' => $expectedReturnDate,
        ];
    }

    /**
     * Requirement 1.6.3: Records the return of an issued asset.
     *
     * @param string $transactionId Transaction UUID.
     * @param string $returnedCondition Condition upon return ('RETURNED_COMPLETE', 'RETURNED_DAMAGED').
     * @param string $adminUserId Receiving staff / admin user UUID.
     * @param string|null $remarks Return notes.
     * @return array{transaction_id: string, status: string, returned_at: string}
     * @throws InvalidArgumentException If transaction not found or already returned.
     */
    public function returnAsset(
        string $transactionId,
        string $returnedCondition,
        string $adminUserId,
        ?string $remarks = null
    ): array {
        $returnedCondition = strtoupper(trim($returnedCondition));
        if (!in_array($returnedCondition, ['RETURNED_COMPLETE', 'RETURNED_DAMAGED', 'LOST'], true)) {
            throw new InvalidArgumentException("Invalid return condition specified.");
        }

        $this->pdo->beginTransaction();
        try {
            $stmtTx = $this->pdo->prepare("SELECT id, asset_id, quantity_borrowed, transaction_status FROM asset_transactions WHERE id = :id FOR UPDATE");
            $stmtTx->execute([':id' => $transactionId]);
            $tx = $stmtTx->fetch(PDO::FETCH_ASSOC);

            if (!$tx) {
                throw new InvalidArgumentException("Asset transaction record not found.");
            }

            if ($tx['transaction_status'] !== 'BORROWED' && $tx['transaction_status'] !== 'OVERDUE') {
                throw new InvalidArgumentException("Transaction has already been processed or returned.");
            }

            $assetId = $tx['asset_id'];
            $qty = (int) $tx['quantity_borrowed'];

            // Update transaction
            $stmtUpdTx = $this->pdo->prepare("
                UPDATE asset_transactions 
                SET transaction_status = :status, returned_at = NOW(), received_by = :received_by, remarks = COALESCE(:remarks, remarks)
                WHERE id = :id
            ");
            $stmtUpdTx->execute([
                ':status'      => $returnedCondition,
                ':received_by' => $adminUserId,
                ':remarks'     => $remarks,
                ':id'          => $transactionId,
            ]);

            // Restore asset available quantity if completed or damaged
            if ($returnedCondition !== 'LOST') {
                $stmtRest = $this->pdo->prepare("UPDATE assets SET available_quantity = available_quantity + :qty, updated_at = NOW() WHERE id = :id");
                $stmtRest->execute([':qty' => $qty, ':id' => $assetId]);
            }

            Logger::audit($adminUserId, 'RETURN_ASSET', 'asset_transactions', $transactionId, [
                'previous_status' => $tx['transaction_status'],
            ], [
                'new_status' => $returnedCondition,
            ]);

            $this->pdo->commit();
        } catch (Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return [
            'transaction_id' => $transactionId,
            'status'         => $returnedCondition,
            'returned_at'    => date('Y-m-d H:i:s'),
        ];
    }

    /**
     * Requirement 1.7.1-1.7.3: Generates daily, weekly, and monthly statistical analytics reports.
     *
     * @param string $period Reporting period ('daily', 'weekly', 'monthly').
     * @return array{period: string, date_range: array{start: string, end: string}, documents: array{total: int, pending: int, approved: int, rejected: int}, appointments: array{total: int, booked: int, confirmed: int, attended: int, cancelled: int}, complaints: array{total: int, filed: int, under_investigation: int, resolved: int}, residents: array{total_registered: int, new_in_period: int}}
     */
    public function generateStatisticalReport(string $period = 'daily'): array {
        $period = strtolower(trim($period));

        switch ($period) {
            case 'weekly':
                $startDate = date('Y-m-d 00:00:00', strtotime('-7 days'));
                break;
            case 'monthly':
                $startDate = date('Y-m-d 00:00:00', strtotime('-30 days'));
                break;
            case 'daily':
            default:
                $period = 'daily';
                $startDate = date('Y-m-d 00:00:00');
                break;
        }

        $endDate = date('Y-m-d 23:59:59');

        // Document statistics
        $stmtDoc = $this->pdo->prepare("
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected
            FROM document_requests
            WHERE created_at >= :start
        ");
        $stmtDoc->execute([':start' => $startDate]);
        $docStats = $stmtDoc->fetch(PDO::FETCH_ASSOC);

        // Appointment statistics
        $stmtAppt = $this->pdo->prepare("
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'BOOKED' THEN 1 ELSE 0 END) AS booked,
                SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed,
                SUM(CASE WHEN status = 'ATTENDED' THEN 1 ELSE 0 END) AS attended,
                SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
            FROM appointments
            WHERE created_at >= :start
        ");
        $stmtAppt->execute([':start' => $startDate]);
        $apptStats = $stmtAppt->fetch(PDO::FETCH_ASSOC);

        // Complaint statistics
        $stmtCmp = $this->pdo->prepare("
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'FILED' THEN 1 ELSE 0 END) AS filed,
                SUM(CASE WHEN status = 'UNDER_INVESTIGATION' THEN 1 ELSE 0 END) AS under_investigation,
                SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved
            FROM complaints
            WHERE created_at >= :start
        ");
        $stmtCmp->execute([':start' => $startDate]);
        $cmpStats = $stmtCmp->fetch(PDO::FETCH_ASSOC);

        // Resident statistics
        $totalResidents = (int) $this->pdo->query("SELECT COUNT(*) FROM users WHERE role_id = 3")->fetchColumn();
        $stmtResNew = $this->pdo->prepare("SELECT COUNT(*) FROM users WHERE role_id = 3 AND created_at >= :start");
        $stmtResNew->execute([':start' => $startDate]);
        $newResidents = (int) $stmtResNew->fetchColumn();

        return [
            'period'     => $period,
            'date_range' => [
                'start' => $startDate,
                'end'   => $endDate,
            ],
            'documents'  => [
                'total'    => (int) ($docStats['total'] ?? 0),
                'pending'  => (int) ($docStats['pending'] ?? 0),
                'approved' => (int) ($docStats['approved'] ?? 0),
                'rejected' => (int) ($docStats['rejected'] ?? 0),
            ],
            'appointments' => [
                'total'     => (int) ($apptStats['total'] ?? 0),
                'booked'    => (int) ($apptStats['booked'] ?? 0),
                'confirmed' => (int) ($apptStats['confirmed'] ?? 0),
                'attended'  => (int) ($apptStats['attended'] ?? 0),
                'cancelled' => (int) ($apptStats['cancelled'] ?? 0),
            ],
            'complaints' => [
                'total'               => (int) ($cmpStats['total'] ?? 0),
                'filed'               => (int) ($cmpStats['filed'] ?? 0),
                'under_investigation' => (int) ($cmpStats['under_investigation'] ?? 0),
                'resolved'            => (int) ($cmpStats['resolved'] ?? 0),
            ],
            'residents' => [
                'total_registered' => $totalResidents,
                'new_in_period'    => $newResidents,
            ],
        ];
    }

    /**
     * Requirement 2.5.2: Retrieves system key-value settings.
     *
     * @return array<string, array{value: string, description: string|null, updated_at: string}>
     */
    public function getSystemSettings(): array {
        // Ensure table exists safely
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
                setting_value TEXT NOT NULL,
                description VARCHAR(255) DEFAULT NULL,
                updated_by CHAR(36) DEFAULT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        $sql = "SELECT setting_key, setting_value, description, updated_at FROM system_settings";
        $stmt = $this->pdo->query($sql);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $result = [];
        foreach ($rows as $row) {
            $result[$row['setting_key']] = [
                'value'       => $row['setting_value'],
                'description' => $row['description'],
                'updated_at'  => $row['updated_at'],
            ];
        }
        return $result;
    }

    /**
     * Requirement 2.5.2: Updates platform system settings.
     *
     * @param array<string, string> $settings Key-value array of setting pairs.
     * @param string|null $adminUserId Operating Admin UUID.
     * @return array<string, string> Updated settings key-values.
     */
    public function updateSystemSettings(array $settings, ?string $adminUserId = null): array {
        if (empty($settings)) {
            return [];
        }

        $stmt = $this->pdo->prepare("
            INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
            VALUES (:key, :val, :admin_id, NOW())
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()
        ");

        $this->pdo->beginTransaction();
        try {
            foreach ($settings as $key => $val) {
                $key = trim((string) $key);
                $val = trim((string) $val);

                $stmt->execute([
                    ':key'      => $key,
                    ':val'      => $val,
                    ':admin_id' => $adminUserId,
                ]);
            }

            Logger::audit($adminUserId, 'UPDATE_SYSTEM_SETTINGS', 'system_settings', 'GLOBAL', null, $settings);
            $this->pdo->commit();
        } catch (Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $settings;
    }
}



