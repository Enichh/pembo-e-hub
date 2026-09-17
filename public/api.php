<?php

declare(strict_types=1);

date_default_timezone_set('Asia/Manila');

/**
 * Central API Gateway Router - Pembo E-Hub
 *
 * Single entry point for all AJAX/Fetch requests. Maps incoming `action` GET parameters
 * to their respective Vertical Feature Slice controllers.
 *
 * @package PemboEHub\API
 *
 * == FEATURE ACTION REGISTRY ==
 *
 * Auth Slice (AuthController):
 *   - 'csrf': Generate CSRF token [Public]
 *   - 'register': Initiate 2-phase registration [Public]
 *   - 'verify_code': Verify registration 6-digit OTP [Public]
 *   - 'resend_code': Resend registration OTP [Public]
 *   - 'request_password_reset': Initiate password reset [Public]
 *   - 'verify_reset_code': Verify password reset OTP [Public]
 *   - 'reset_password': Apply new password [Public]
 *   - 'resend_reset_code': Resend reset OTP [Public]
 *   - 'login': Authenticate user credentials [Public]
 *   - 'logout': Terminate session [Authenticated]
 *   - 'me': Return active user session [Authenticated]
 *
 * Dashboard Slice (DashboardController):
 *   - 'dashboard_summary': Get summary metrics [Authenticated: Resident | Staff | Admin]
 *
 * Admin Slice (AdminController):
 *   - 'list_audit_logs': Query system audit trail [Role: Admin]
 *   - 'list_staff_users': Query staff user accounts [Role: Admin]
 *   - 'create_staff_user': Create new staff user [Role: Admin]
 *
 * Documents Slice (DocumentController):
 *   - 'document_types': List available document types [Public]
 *   - 'list_requests': List document requests [Authenticated]
 *   - 'get_request': Get single request details [Authenticated]
 *   - 'create_request': Submit document request [Role: Resident]
 *   - 'update_request_status': Update request status [Role: Staff | Admin]
 *   - 'record_payment': Record receipt payment [Role: Staff | Admin]
 *   - 'serve_attachment': Serve uploaded ID document [Authenticated]
 *
 * Appointments Slice (AppointmentController):
 *   - 'appointment_slots': Query time slot availability [Authenticated]
 *   - 'list_appointments': List appointments [Authenticated]
 *   - 'create_appointment': Book appointment slot [Role: Resident]
 *   - 'update_appointment_status': Update appointment status [Role: Staff | Admin]
 *
 * Emergency SOS Slice (EmergencyController):
 *   - 'trigger_sos': Trigger emergency SOS alert [Role: Resident]
 *   - 'list_my_sos': List resident's SOS history [Role: Resident]
 *   - 'list_active_sos': Monitor active SOS queue [Role: Staff | Admin]
 *
 * Profile Slice (ProfileController):
 *   - 'get_profile': Fetch resident profile [Authenticated]
 *   - 'update_profile': Update profile details [Authenticated]
 *
 * Complaints Slice (ComplaintsController):
 *   - 'create_complaint': File complaint report [Role: Resident]
 *   - 'list_my_complaints': List personal complaints [Role: Resident]
 *   - 'list_all_complaints': List full complaint queue [Role: Staff | Admin]
 *   - 'get_complaint': Fetch complaint details [Authenticated]
 *   - 'update_complaint_status': Update complaint status [Role: Staff | Admin]
 *   - 'list_officers': List assigned officers [Role: Staff | Admin]
 */

require_once __DIR__ . '/src/lib/env.php';

// Composer autoloader (PHPMailer + phpdotenv).
$autoload = dirname(__DIR__) . '/vendor/autoload.php';
if (is_file($autoload)) {
    require_once $autoload;
}

// Load .env configuration.
Env::load(dirname(__DIR__));

require_once __DIR__ . '/src/lib/response.php';
require_once __DIR__ . '/src/features/auth/auth_controller.php';
require_once __DIR__ . '/src/features/documents/document_controller.php';
require_once __DIR__ . '/src/features/appointments/appointment_controller.php';
require_once __DIR__ . '/src/features/emergency/emergency_controller.php';
require_once __DIR__ . '/src/features/profile/profile_controller.php';
require_once __DIR__ . '/src/features/complaints/complaints_controller.php';
require_once __DIR__ . '/src/features/dashboard/dashboard_controller.php';
require_once __DIR__ . '/src/features/admin/admin_controller.php';

/** @type {string} Target action requested */
$action = $_GET['action'] ?? '';

/**
 * Router Dispatch Map
 * Maps feature slice controller class names to their supported actions.
 * @var array<string, class-string>
 */
$routeMap = [
    // Auth Slice Actions
    'csrf'                   => AuthController::class,
    'register'               => AuthController::class,
    'verify_code'            => AuthController::class,
    'resend_code'            => AuthController::class,
    'request_password_reset' => AuthController::class,
    'verify_reset_code'      => AuthController::class,
    'reset_password'         => AuthController::class,
    'resend_reset_code'      => AuthController::class,
    'login'                  => AuthController::class,
    'logout'                 => AuthController::class,
    'me'                     => AuthController::class,
    'test-admin'             => AuthController::class,
    'test-staff'             => AuthController::class,

    // Dashboard Slice Actions
    'dashboard_summary'      => DashboardController::class,

    // Admin Slice Actions
    'list_audit_logs'        => AdminController::class,
    'list_staff_users'       => AdminController::class,
    'create_staff_user'      => AdminController::class,
    'toggle_staff_status'    => AdminController::class,
    'admin_metrics'          => AdminController::class,
    'list_assets'            => AdminController::class,
    'create_asset'           => AdminController::class,
    'issue_asset'            => AdminController::class,
    'return_asset'           => AdminController::class,
    'generate_report'        => AdminController::class,
    'export_report_csv'      => AdminController::class,
    'get_system_settings'    => AdminController::class,
    'update_system_settings'  => AdminController::class,

    // Document Services Slice Actions

    'document_types'        => DocumentController::class,
    'list_requests'          => DocumentController::class,
    'get_request'            => DocumentController::class,
    'create_request'         => DocumentController::class,
    'update_request_status'  => DocumentController::class,
    'record_payment'         => DocumentController::class,
    'serve_attachment'       => DocumentController::class,

    // Appointments Slice Actions
    'appointment_slots'      => AppointmentController::class,
    'list_appointments'      => AppointmentController::class,
    'create_appointment'     => AppointmentController::class,
    'update_appointment_status' => AppointmentController::class,

    // Emergency SOS Slice Actions
    'trigger_sos'            => EmergencyController::class,
    'list_my_sos'            => EmergencyController::class,
    'list_active_sos'        => EmergencyController::class,
    'update_sos_status'      => EmergencyController::class,
    'list_sos_dispatch_logs' => EmergencyController::class,

    // Profile Slice Actions
    'get_profile'                => ProfileController::class,
    'update_profile'             => ProfileController::class,
    'list_pending_verifications' => ProfileController::class,
    'list_verification_queue'    => ProfileController::class,
    'verify_resident_account'    => ProfileController::class,
    'list_resident_directory'    => ProfileController::class,
    'serve_resident_id'          => ProfileController::class,

    // Complaints Slice Actions
    'create_complaint'       => ComplaintsController::class,
    'list_my_complaints'     => ComplaintsController::class,
    'list_all_complaints'    => ComplaintsController::class,
    'get_complaint'          => ComplaintsController::class,
    'update_complaint_status' => ComplaintsController::class,
    'list_officers'          => ComplaintsController::class,
];

if ($action === 'versions') {
    require_once __DIR__ . '/src/lib/auth_middleware.php';
    require_once __DIR__ . '/src/lib/versions.php';
    require_once __DIR__ . '/src/config/database.php';
    $user = AuthMiddleware::requireAuth();
    $pdo = Database::getConnection();
    Response::success("Versions.", [
        'appointments' => appointmentsVersion($pdo, $user),
        'complaints'   => complaintsVersion($pdo, $user),
        'documents'    => documentsVersion($pdo, $user),
        'emergency'    => emergencyVersion($pdo, $user),
    ]);
    exit;
}

// Dispatch action to controller if registered in route map
if (isset($routeMap[$action])) {
    $controllerClass = $routeMap[$action];
    $controller = new $controllerClass();
    $controller->handle($action);
    exit;
}

Response::error("Invalid API endpoint.", 404);

