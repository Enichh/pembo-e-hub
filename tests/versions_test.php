<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/src/config/database.php';
require_once __DIR__ . '/../public/src/features/auth/auth_service.php';
require_once __DIR__ . '/../public/src/features/appointments/appointment_service.php';
require_once __DIR__ . '/../public/src/features/complaints/complaints_service.php';
require_once __DIR__ . '/../public/src/features/documents/document_service.php';
require_once __DIR__ . '/../public/src/lib/versions.php';

class VersionsTestSuite {
    private PDO $pdo;
    private AuthService $authService;
    private AppointmentsService $apptService;
    private ComplaintsService $complaintsService;
    private DocumentService $docService;
    private int $passed = 0;
    private int $failed = 0;

    private array $residentA;
    private array $residentB;
    private array $staffUser;
    private array $createdUserIds = [];

    public function __construct() {
        $this->pdo = Database::getConnection();
        $this->authService = new AuthService($this->pdo);
        $this->apptService = new AppointmentsService($this->pdo);
        $this->complaintsService = new ComplaintsService($this->pdo);
        $this->docService = new DocumentService($this->pdo);
    }

    public function runAll(): void {
        echo "\n=== Running Rigorous Versions & Near-Real-Time Test Suite ===\n\n";

        try {
            $this->setupTestUsers();
            $this->testVersionFunctionsReturnIntegers();
            $this->testFailClosedRoleGuards();
            $this->testAppointmentsResidentIsolation();
            $this->testComplaintsResidentIsolation();
            $this->testDocumentsResidentIsolation();
            $this->testStaffSeesGlobalScope();
        } finally {
            $this->tearDown();
        }

        echo "\n=======================================================\n";
        echo "TEST SUMMARY: {$this->passed} Passed, {$this->failed} Failed\n";
        echo "=======================================================\n\n";

        if ($this->failed > 0) {
            exit(1);
        }
    }

    private function assert(bool $condition, string $testName): void {
        if ($condition) {
            echo "  [PASS] {$testName}\n";
            $this->passed++;
        } else {
            echo "  [FAIL] {$testName}\n";
            $this->failed++;
        }
    }

    private function setupTestUsers(): void {
        $suffix = bin2hex(random_bytes(3));

        // Create Resident A
        $emailA = "test.resident.a.{$suffix}@pembo.gov.ph";
        $passHash = password_hash('ResidentPass123!', PASSWORD_BCRYPT);
        $userAId = $this->authService->generateUuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO users (id, role_id, email, password_hash, is_active, email_verified_at)
            VALUES (:id, (SELECT id FROM roles WHERE name = 'RESIDENT'), :email, :pass, 1, NOW())
        ");
        $stmt->execute([':id' => $userAId, ':email' => $emailA, ':pass' => $passHash]);
        $this->residentA = ['id' => $userAId, 'email' => $emailA, 'role_name' => 'RESIDENT'];
        $this->createdUserIds[] = $userAId;

        // Create Resident B
        $emailB = "test.resident.b.{$suffix}@pembo.gov.ph";
        $userBId = $this->authService->generateUuid();
        $stmt->execute([':id' => $userBId, ':email' => $emailB, ':pass' => $passHash]);
        $this->residentB = ['id' => $userBId, 'email' => $emailB, 'role_name' => 'RESIDENT'];
        $this->createdUserIds[] = $userBId;

        // Create Staff
        $emailStaff = "test.staff.v.{$suffix}@pembo.gov.ph";
        $staffId = $this->authService->generateUuid();
        $stmtStaff = $this->pdo->prepare("
            INSERT INTO users (id, role_id, email, password_hash, is_active, email_verified_at)
            VALUES (:id, (SELECT id FROM roles WHERE name = 'STAFF'), :email, :pass, 1, NOW())
        ");
        $stmtStaff->execute([':id' => $staffId, ':email' => $emailStaff, ':pass' => $passHash]);
        $this->staffUser = ['id' => $staffId, 'email' => $emailStaff, 'role_name' => 'STAFF'];
        $this->createdUserIds[] = $staffId;
    }

    private function testVersionFunctionsReturnIntegers(): void {
        $av = appointmentsVersion($this->pdo, $this->residentA);
        $cv = complaintsVersion($this->pdo, $this->residentA);
        $dv = documentsVersion($this->pdo, $this->residentA);
        $ev = emergencyVersion($this->pdo, $this->residentA);

        $this->assert(is_int($av), "appointmentsVersion returns an integer");
        $this->assert(is_int($cv), "complaintsVersion returns an integer");
        $this->assert(is_int($dv), "documentsVersion returns an integer");
        $this->assert(is_int($ev), "emergencyVersion returns an integer");
    }

    private function testFailClosedRoleGuards(): void {
        // Unknown role / missing role should default to resident scoping (not global)
        $unknownUser = ['id' => $this->residentA['id'], 'email' => 'unknown@pembo.gov.ph', 'role_name' => 'GUEST'];
        $vUnknown = appointmentsVersion($this->pdo, $unknownUser);
        $vResident = appointmentsVersion($this->pdo, $this->residentA);
        $vStaff = appointmentsVersion($this->pdo, $this->staffUser);

        $this->assert($vUnknown === $vResident, "Unknown role fails closed to caller-scoped version");
    }

    private function testAppointmentsResidentIsolation(): void {
        $beforeA = appointmentsVersion($this->pdo, $this->residentA);
        $beforeB = appointmentsVersion($this->pdo, $this->residentB);

        // Sleep 1 second to cross UNIX_TIMESTAMP 1-second boundary cleanly
        sleep(1);

        $futureDate = date('Y-m-d', strtotime('+10 days'));
        $this->apptService->book($this->residentA['id'], 'Barangay Clearance Appointment', $futureDate, '09:00-10:00');

        $afterA = appointmentsVersion($this->pdo, $this->residentA);
        $afterB = appointmentsVersion($this->pdo, $this->residentB);

        $this->assert($afterA > $beforeA, "Resident A appointmentsVersion strictly increased (> beforeA)");
        $this->assert($afterB === $beforeB, "Resident B appointmentsVersion remained strictly isolated (afterB === beforeB)");
    }

    private function testComplaintsResidentIsolation(): void {
        $beforeA = complaintsVersion($this->pdo, $this->residentA);
        $beforeB = complaintsVersion($this->pdo, $this->residentB);

        sleep(1);

        $this->complaintsService->create(
            $this->residentA['id'],
            'Noise Disturbance',
            'Zone 1 Pembo',
            date('Y-m-d H:i:s'),
            'Loud music past 11 PM.'
        );

        $afterA = complaintsVersion($this->pdo, $this->residentA);
        $afterB = complaintsVersion($this->pdo, $this->residentB);

        $this->assert($afterA > $beforeA, "Resident A complaintsVersion strictly increased (> beforeA)");
        $this->assert($afterB === $beforeB, "Resident B complaintsVersion remained strictly isolated (afterB === beforeB)");
    }

    private function testDocumentsResidentIsolation(): void {
        $beforeA = documentsVersion($this->pdo, $this->residentA);
        $beforeB = documentsVersion($this->pdo, $this->residentB);

        sleep(1);

        // Fetch valid doc type
        $dtStmt = $this->pdo->query("SELECT id FROM document_types WHERE is_active = 1 LIMIT 1");
        $docTypeId = (int)$dtStmt->fetchColumn();

        $reqId = $this->authService->generateUuid();
        $tracking = 'PEM-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $stmt = $this->pdo->prepare("
            INSERT INTO document_requests (id, tracking_number, resident_id, document_type_id, purpose, status, created_at, updated_at)
            VALUES (:id, :tracking, :resident_id, :doc_type_id, 'Employment requirement', 'PENDING', NOW(), NOW())
        ");
        $stmt->execute([
            ':id' => $reqId,
            ':tracking' => $tracking,
            ':resident_id' => $this->residentA['id'],
            ':doc_type_id' => $docTypeId
        ]);

        $afterA = documentsVersion($this->pdo, $this->residentA);
        $afterB = documentsVersion($this->pdo, $this->residentB);

        $this->assert($afterA > $beforeA, "Resident A documentsVersion strictly increased (> beforeA)");
        $this->assert($afterB === $beforeB, "Resident B documentsVersion remained strictly isolated (afterB === beforeB)");
    }

    private function testStaffSeesGlobalScope(): void {
        $staffV = appointmentsVersion($this->pdo, $this->staffUser);
        $resAV = appointmentsVersion($this->pdo, $this->residentA);

        $this->assert($staffV >= $resAV, "Staff appointmentsVersion reflects global table version");
    }

    private function tearDown(): void {
        if (empty($this->createdUserIds)) return;

        $inClause = implode("','", array_map('addslashes', $this->createdUserIds));

        // Clean dependent rows
        $this->pdo->exec("DELETE FROM appointments WHERE resident_id IN ('{$inClause}')");
        $this->pdo->exec("DELETE FROM complaints WHERE resident_id IN ('{$inClause}')");
        $this->pdo->exec("DELETE FROM document_requests WHERE resident_id IN ('{$inClause}')");
        $this->pdo->exec("DELETE FROM emergency_sos WHERE resident_id IN ('{$inClause}')");
        $this->pdo->exec("DELETE FROM resident_profiles WHERE user_id IN ('{$inClause}')");
        $this->pdo->exec("DELETE FROM staff_profiles WHERE user_id IN ('{$inClause}')");
        $this->pdo->exec("DELETE FROM users WHERE id IN ('{$inClause}')");
    }
}

$suite = new VersionsTestSuite();
$suite->runAll();
