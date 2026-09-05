<?php

declare(strict_types=1);

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/auth_middleware.php';
require_once __DIR__ . '/../../lib/response.php';
require_once __DIR__ . '/admin_service.php';

class AdminController {
    private AdminService $adminService;

    public function __construct(?AdminService $service = null) {
        if ($service !== null) {
            $this->adminService = $service;
        } else {
            $pdo = Database::getConnection();
            $this->adminService = new AdminService($pdo);
        }
    }

    public function handle(string $action): void {
        switch ($action) {
            case 'list_audit_logs':
                $this->listAuditLogs();
                break;
            case 'list_staff_users':
                $this->listStaffUsers();
                break;
            case 'create_staff_user':
                $this->createStaffUser();
                break;
            case 'toggle_staff_status':
                $this->toggleStaffStatus();
                break;
            case 'admin_metrics':
                $this->adminMetrics();
                break;
            case 'list_assets':
                $this->listAssets();
                break;
            case 'create_asset':
                $this->createAsset();
                break;
            case 'issue_asset':
                $this->issueAsset();
                break;
            case 'return_asset':
                $this->returnAsset();
                break;
            case 'generate_report':
                $this->generateReport();
                break;
            case 'export_report_csv':
                $this->exportReportCsv();
                break;
            case 'get_system_settings':
                $this->getSystemSettings();
                break;
            case 'update_system_settings':
                $this->updateSystemSettings();
                break;
            default:
                Response::error("Unknown admin action.", 404);
        }
    }

    public function listAuditLogs(): void {
        AuthMiddleware::requireRole(['ADMIN']);

        $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 50;
        $offset = isset($_GET['offset']) ? (int) $_GET['offset'] : 0;

        try {
            $logs = $this->adminService->listAuditLogs($limit, $offset);
            Response::success("Audit logs retrieved successfully.", [
                'logs'   => $logs,
                'count'  => count($logs),
                'limit'  => $limit,
                'offset' => $offset,
            ]);
        } catch (Exception $e) {
            Response::error("Failed to retrieve audit logs.", 500);
        }
    }

    public function listStaffUsers(): void {
        AuthMiddleware::requireRole(['ADMIN']);

        try {
            $staff = $this->adminService->listStaffUsers();
            Response::success("Staff users retrieved successfully.", [
                'staff' => $staff,
                'count' => count($staff),
            ]);
        } catch (Exception $e) {
            Response::error("Failed to retrieve staff users.", 500);
        }
    }

    public function createStaffUser(): void {
        AuthMiddleware::requireCsrf();
        $admin = AuthMiddleware::requireRole(['ADMIN']);

        $input = $this->getJsonInput();
        $email      = $input['email'] ?? '';
        $password   = $input['password'] ?? '';
        $firstName  = $input['first_name'] ?? '';
        $lastName   = $input['last_name'] ?? '';
        $department = $input['department'] ?? '';
        $position   = $input['position'] ?? '';

        try {
            $staff = $this->adminService->createStaffUser(
                $email,
                $password,
                $firstName,
                $lastName,
                $department,
                $position,
                $admin['id']
            );
            Response::success("Staff account created successfully.", $staff);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            Response::error("Failed to create staff user account.", 500);
        }
    }

    public function toggleStaffStatus(): void {
        AuthMiddleware::requireCsrf();
        $admin = AuthMiddleware::requireRole(['ADMIN']);

        $input = $this->getJsonInput();
        $staffUserId = $input['user_id'] ?? '';
        $isActive    = isset($input['is_active']) ? (bool)$input['is_active'] : false;

        if (empty($staffUserId)) {
            Response::error("Staff user_id is required.", 422);
        }

        try {
            $result = $this->adminService->toggleStaffStatus($staffUserId, $isActive, $admin['id']);
            Response::success($isActive ? "Staff account activated." : "Staff account deactivated.", $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            Response::error("Failed to update staff status.", 500);
        }
    }

    public function adminMetrics(): void {
        AuthMiddleware::requireRole(['ADMIN']);

        try {
            $metrics = $this->adminService->getAdminOverviewMetrics();
            Response::success("Admin overview metrics retrieved.", $metrics);
        } catch (Exception $e) {
            Response::error("Failed to retrieve admin metrics.", 500);
        }
    }

    public function listAssets(): void {
        AuthMiddleware::requireRole(['ADMIN', 'STAFF']);

        try {
            $assets = $this->adminService->listAssets();
            Response::success("Inventory assets retrieved successfully.", [
                'assets' => $assets,
                'count'  => count($assets),
            ]);
        } catch (Exception $e) {
            Response::error("Failed to retrieve inventory assets.", 500);
        }
    }

    public function createAsset(): void {
        AuthMiddleware::requireCsrf();
        $admin = AuthMiddleware::requireRole(['ADMIN']);

        $input = $this->getJsonInput();
        $name      = $input['name'] ?? '';
        $category  = $input['category'] ?? '';
        $qty       = isset($input['total_quantity']) ? (int)$input['total_quantity'] : 0;
        $location  = $input['storage_location'] ?? '';
        $condition = $input['item_condition'] ?? 'GOOD';

        try {
            $asset = $this->adminService->createAsset($name, $category, $qty, $location, $condition, $admin['id']);
            Response::success("Asset registered successfully.", $asset);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            Response::error("Failed to register new asset.", 500);
        }
    }

    public function issueAsset(): void {
        AuthMiddleware::requireCsrf();
        $admin = AuthMiddleware::requireRole(['ADMIN', 'STAFF']);

        $input = $this->getJsonInput();
        $assetId        = $input['asset_id'] ?? '';
        $borrowerName   = $input['borrower_name'] ?? '';
        $borrowerContact = $input['borrower_contact'] ?? '';
        $qty            = isset($input['quantity_borrowed']) ? (int)$input['quantity_borrowed'] : 0;
        $returnDate     = $input['expected_return_date'] ?? '';
        $remarks        = $input['remarks'] ?? null;

        try {
            $tx = $this->adminService->issueAsset($assetId, $borrowerName, $borrowerContact, $qty, $returnDate, $admin['id'], $remarks);
            Response::success("Asset issued successfully.", $tx);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            Response::error("Failed to issue asset.", 500);
        }
    }

    public function returnAsset(): void {
        AuthMiddleware::requireCsrf();
        $admin = AuthMiddleware::requireRole(['ADMIN', 'STAFF']);

        $input = $this->getJsonInput();
        $txId      = $input['transaction_id'] ?? '';
        $condition = $input['returned_condition'] ?? 'RETURNED_COMPLETE';
        $remarks   = $input['remarks'] ?? null;

        try {
            $res = $this->adminService->returnAsset($txId, $condition, $admin['id'], $remarks);
            Response::success("Asset return processed successfully.", $res);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            Response::error("Failed to process asset return.", 500);
        }
    }

    public function generateReport(): void {
        AuthMiddleware::requireRole(['ADMIN']);

        $period = $_GET['period'] ?? 'daily';

        try {
            $report = $this->adminService->generateStatisticalReport($period);
            Response::success("Statistical report generated.", $report);
        } catch (Exception $e) {
            Response::error("Failed to generate statistical report.", 500);
        }
    }

    public function exportReportCsv(): void {
        AuthMiddleware::requireRole(['ADMIN']);

        $period = $_GET['period'] ?? 'daily';
        $report = $this->adminService->generateStatisticalReport($period);

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="pembo_ehub_report_' . $period . '_' . date('Ymd_His') . '.csv"');

        $out = fopen('php://output', 'w');
        fputcsv($out, ['Barangay Pembo E-Hub Statistical Summary Report']);
        fputcsv($out, ['Reporting Period', strtoupper($report['period'])]);
        fputcsv($out, ['Date Range', $report['date_range']['start'] . ' to ' . $report['date_range']['end']]);
        fputcsv($out, []);

        fputcsv($out, ['Category', 'Metric', 'Value']);
        fputcsv($out, ['Documents', 'Total Submitted', $report['documents']['total']]);
        fputcsv($out, ['Documents', 'Pending Review', $report['documents']['pending']]);
        fputcsv($out, ['Documents', 'Approved', $report['documents']['approved']]);
        fputcsv($out, ['Documents', 'Rejected', $report['documents']['rejected']]);
        fputcsv($out, ['Appointments', 'Total Bookings', $report['appointments']['total']]);
        fputcsv($out, ['Appointments', 'Booked', $report['appointments']['booked']]);
        fputcsv($out, ['Appointments', 'Confirmed', $report['appointments']['confirmed']]);
        fputcsv($out, ['Appointments', 'Attended', $report['appointments']['attended']]);
        fputcsv($out, ['Appointments', 'Cancelled', $report['appointments']['cancelled']]);
        fputcsv($out, ['Complaints', 'Total Incidents', $report['complaints']['total']]);
        fputcsv($out, ['Complaints', 'Filed', $report['complaints']['filed']]);
        fputcsv($out, ['Complaints', 'Under Investigation', $report['complaints']['under_investigation']]);
        fputcsv($out, ['Complaints', 'Resolved', $report['complaints']['resolved']]);
        fputcsv($out, ['Residents', 'Total Registered Constituents', $report['residents']['total_registered']]);
        fputcsv($out, ['Residents', 'New Registrations in Period', $report['residents']['new_in_period']]);

        fclose($out);
        exit;
    }

    public function getSystemSettings(): void {
        AuthMiddleware::requireRole(['ADMIN', 'STAFF']);

        try {
            $settings = $this->adminService->getSystemSettings();
            Response::success("System settings retrieved successfully.", [
                'settings' => $settings,
            ]);
        } catch (Exception $e) {
            Response::error("Failed to retrieve system settings.", 500);
        }
    }

    public function updateSystemSettings(): void {
        AuthMiddleware::requireCsrf();
        $admin = AuthMiddleware::requireRole(['ADMIN']);

        $input = $this->getJsonInput();
        $settings = $input['settings'] ?? [];

        if (!is_array($settings) || empty($settings)) {
            Response::error("Settings array is required.", 422);
        }

        try {
            $res = $this->adminService->updateSystemSettings($settings, $admin['id']);
            Response::success("System settings updated successfully.", $res);
        } catch (Exception $e) {
            Response::error("Failed to update system settings.", 500);
        }
    }

    private function getJsonInput(): array {
        $raw = file_get_contents('php://input');
        if (!$raw) return [];
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}

