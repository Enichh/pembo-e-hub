<?php

declare(strict_types=1);

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/auth_middleware.php';
require_once __DIR__ . '/../../lib/response.php';
require_once __DIR__ . '/dashboard_service.php';

class DashboardController {
    private DashboardService $dashboardService;

    public function __construct(?DashboardService $service = null) {
        if ($service !== null) {
            $this->dashboardService = $service;
        } else {
            $pdo = Database::getConnection();
            $this->dashboardService = new DashboardService($pdo);
        }
    }

    public function handle(string $action): void {
        switch ($action) {
            case 'dashboard_summary':
                $this->summary();
                break;
            default:
                Response::error("Unknown dashboard action.", 404);
        }
    }

    public function summary(): void {
        $user = AuthMiddleware::requireAuth();
        $roleName = strtoupper($user['role_name'] ?? '');

        if ($roleName === 'RESIDENT') {
            $data = $this->dashboardService->getResidentSummary($user['id']);
        } else {
            // STAFF or ADMIN
            $data = $this->dashboardService->getStaffAdminSummary();
        }

        Response::success("Dashboard summary retrieved.", [
            'role_name' => $roleName,
            'summary'   => $data,
        ]);
    }
}
