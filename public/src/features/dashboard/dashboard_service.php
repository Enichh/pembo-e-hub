<?php

declare(strict_types=1);

/**
 * Dashboard Metrics Aggregation Service
 *
 * Provides summary statistics and metric counters for resident dashboard widgets
 * and back-office staff/admin management consoles.
 *
 * @package PemboEHub\Features\Dashboard
 */
class DashboardService {
    private PDO $pdo;

    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
    }

    /**
     * Retrieves aggregated summary metrics for a resident user.
     *
     * @param string $residentId Resident user UUID.
     * @return array{pending_documents: int, total_documents: int, upcoming_appointments: int, active_complaints: int}
     */
    public function getResidentSummary(string $residentId): array {
        // Pending document requests
        $stmtDocs = $this->pdo->prepare("SELECT COUNT(*) FROM document_requests WHERE resident_id = :rid AND status = 'PENDING'");
        $stmtDocs->execute([':rid' => $residentId]);
        $pendingDocs = (int) $stmtDocs->fetchColumn();

        // Total document requests
        $stmtTotalDocs = $this->pdo->prepare("SELECT COUNT(*) FROM document_requests WHERE resident_id = :rid");
        $stmtTotalDocs->execute([':rid' => $residentId]);
        $totalDocs = (int) $stmtTotalDocs->fetchColumn();

        // Upcoming booked appointments
        $stmtAppts = $this->pdo->prepare("SELECT COUNT(*) FROM appointments WHERE resident_id = :rid AND appointment_date >= CURDATE() AND status IN ('BOOKED', 'CONFIRMED')");
        $stmtAppts->execute([':rid' => $residentId]);
        $upcomingAppts = (int) $stmtAppts->fetchColumn();

        // Active filed complaints
        $stmtCmpl = $this->pdo->prepare("SELECT COUNT(*) FROM complaints WHERE resident_id = :rid AND status IN ('FILED', 'UNDER_INVESTIGATION')");
        $stmtCmpl->execute([':rid' => $residentId]);
        $activeComplaints = (int) $stmtCmpl->fetchColumn();

        return [
            'pending_documents'   => $pendingDocs,
            'total_documents'     => $totalDocs,
            'upcoming_appointments' => $upcomingAppts,
            'active_complaints'   => $activeComplaints,
        ];
    }

    /**
     * Retrieves aggregated back-office operational summary metrics for Staff & Admin.
     *
     * @return array{pending_documents_queue: int, today_appointments: int, active_complaints_queue: int, active_emergency_sos: int, pending_verifications: int}
     */
    public function getStaffAdminSummary(): array {
        // System-wide pending document requests queue
        $stmtDocs = $this->pdo->query("SELECT COUNT(*) FROM document_requests WHERE status = 'PENDING'");
        $pendingDocs = (int) $stmtDocs->fetchColumn();

        // Today's appointments
        $stmtAppts = $this->pdo->query("SELECT COUNT(*) FROM appointments WHERE appointment_date = CURDATE() AND status IN ('BOOKED', 'CONFIRMED')");
        $todayAppts = (int) $stmtAppts->fetchColumn();

        // Active complaints queue
        $stmtCmpl = $this->pdo->query("SELECT COUNT(*) FROM complaints WHERE status IN ('FILED', 'UNDER_INVESTIGATION')");
        $activeComplaints = (int) $stmtCmpl->fetchColumn();

        // Active Emergency SOS alerts
        $stmtSos = $this->pdo->query("SELECT COUNT(*) FROM emergency_sos WHERE status = 'TRIGGERED'");
        $activeSos = (int) $stmtSos->fetchColumn();

        // Resident applications awaiting identity review (verification queue)
        $stmtVer = $this->pdo->query("SELECT COUNT(*) FROM resident_profiles WHERE verification_status = 'PENDING'");
        $pendingVer = (int) $stmtVer->fetchColumn();

        return [
            'pending_documents_queue' => $pendingDocs,
            'today_appointments'      => $todayAppts,
            'active_complaints_queue' => $activeComplaints,
            'active_emergency_sos'    => $activeSos,
            'pending_verifications'   => $pendingVer,
        ];
    }
}

