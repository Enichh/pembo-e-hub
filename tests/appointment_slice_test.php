<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/src/config/database.php';
require_once __DIR__ . '/../public/src/features/auth/auth_service.php';
require_once __DIR__ . '/../public/src/features/appointments/appointment_service.php';
require_once __DIR__ . '/../public/src/lib/csrf.php';

// Slice 3 — Resident Services: Appointments
// Exercises appointment booking against the real `appointments` table,
// including the UNIQUE(resident_id, appointment_date, time_slot) constraint,
// role-scoped listing, and staff status transitions (booking workflow).

class AppointmentsSliceTest {
    private PDO $pdo;
    private AuthService $authService;
    private AppointmentsService $apptService;
    private int $passed = 0;
    private int $failed = 0;

    private array $staffUser;
    private array $residentA;
    private array $residentB;

    public function __construct() {
        $this->pdo = Database::getConnection();
        $this->authService = new AuthService($this->pdo);
        $this->apptService = new AppointmentsService($this->pdo);
    }

    public function runAll(): void {
        echo "\n=== Running Slice 3: Appointments Test Suite ===\n\n";

        $this->setupTestUsers();
        $this->testAppointmentsTablePresent();
        $this->testResidentBooksAppointment();
        $this->testDuplicateSlotRejectedCleanly();
        $this->testInvalidTimeSlotRejected();
        $this->testPastDateRejected();
        $this->testStaffListsAll();
        $this->testResidentListsOwnOnly();
        $this->testStatusUpdateByStaff();
        $this->testCancellationRecordsReason();
        $this->testAuditLogOnBooking();

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

    private function tomorrow(): string {
        return date('Y-m-d', strtotime('+1 day'));
    }

    private function testableAuthService(): AuthService {
        return new class($this->pdo) extends AuthService {
            public string $lastCode = '';
            public function __construct(PDO $pdo) {
                parent::__construct($pdo, false);
            }
            protected function generateVerificationCode(): int {
                $code = random_int(100000, 999999);
                $this->lastCode = (string) $code;
                return $code;
            }
        };
    }

    private function setupTestUsers(): void {
        $this->staffUser = $this->authService->login('staff@pembo.gov.ph', 'Staff12345!');

        // Register fresh residents per run so re-running the suite on the same
        // calendar day cannot trip the per-resident UNIQUE slot constraint.
        $testableAuth = $this->testableAuthService();

        $emailA = 'appt_resident_a_' . time() . '@pembo.gov.ph';
        $testableAuth->initiateRegistration($emailA, 'Resident12345!', [
            'first_name' => 'Appt',
            'last_name' => 'ResidentA',
            'birthdate' => '1995-01-01',
            'gender' => 'Male',
            'civil_status' => 'Single',
            'street_address' => '123 Appt St',
        ]);
        $this->residentA = $testableAuth->verifyCode($emailA, $testableAuth->lastCode);

        $emailB = 'appt_resident_b_' . time() . '@pembo.gov.ph';
        $testableAuth->initiateRegistration($emailB, 'Resident12345!', [
            'first_name' => 'Appt',
            'last_name' => 'ResidentB',
            'birthdate' => '1995-01-01',
            'gender' => 'Female',
            'civil_status' => 'Single',
            'street_address' => '456 Appt St',
        ]);
        $this->residentB = $testableAuth->verifyCode($emailB, $testableAuth->lastCode);
    }

    private function testAppointmentsTablePresent(): void {
        $stmt = $this->pdo->query("SELECT 1 FROM appointments LIMIT 0");
        $this->assert($stmt !== false, "appointments table is queryable");
    }

    private function testResidentBooksAppointment(): void {
        $appt = $this->apptService->book(
            $this->residentA['id'],
            'Barangay Clearance Appointment',
            $this->tomorrow(),
            '09:00-10:00'
        );
        $this->assert(!empty($appt['id']), "Appointment ID generated");
        $this->assert($appt['status'] === 'BOOKED', "New appointment starts as BOOKED");
        $this->assert($appt['time_slot'] === '09:00-10:00', "Time slot recorded correctly");
    }

    private function testDuplicateSlotRejectedCleanly(): void {
        // Resident A books the same date+slot a second time -> must be a clean domain error.
        $blocked = false;
        try {
            $this->apptService->book(
                $this->residentA['id'],
                'Duplicate booking',
                $this->tomorrow(),
                '09:00-10:00'
            );
        } catch (InvalidArgumentException $e) {
            $blocked = str_contains(strtolower($e->getMessage()), 'slot');
        }
        $this->assert($blocked, "Duplicate resident/date/slot rejected with a clean 'slot taken' message");

        // A DIFFERENT resident may still book the same date/slot (uniqueness is per resident).
        $ok = false;
        try {
            $this->apptService->book(
                $this->residentB['id'],
                'Different person booking',
                $this->tomorrow(),
                '09:00-10:00'
            );
            $ok = true;
        } catch (InvalidArgumentException $e) {
            $ok = false;
        }
        $this->assert($ok, "Another resident can book the same date/time slot");
    }

    private function testInvalidTimeSlotRejected(): void {
        $blocked = false;
        try {
            $this->apptService->book(
                $this->residentA['id'],
                'Bad slot',
                $this->tomorrow(),
                '99:99-99:99'
            );
        } catch (InvalidArgumentException $e) {
            $blocked = true;
        }
        $this->assert($blocked, "Bookings reject a time slot outside the allowed schedule");
    }

    private function testPastDateRejected(): void {
        $blocked = false;
        try {
            $this->apptService->book(
                $this->residentA['id'],
                'Past slot',
                date('Y-m-d', strtotime('-1 day')),
                '09:00-10:00'
            );
        } catch (InvalidArgumentException $e) {
            $blocked = true;
        }
        $this->assert($blocked, "Bookings reject past dates");
    }

    private function testStaffListsAll(): void {
        $all = $this->apptService->list($this->staffUser, $this->tomorrow());
        $this->assert(count($all) >= 1, "Staff can list appointments for a date");
    }

    private function testResidentListsOwnOnly(): void {
        // Resident A (fresh per run) only sees rows they own — never other residents'.
        $residentAList = $this->apptService->list($this->residentA, null);
        foreach ($residentAList as $appt) {
            $this->assert($appt['resident_id'] === $this->residentA['id'], "Resident only sees their own appointments");
        }
        $this->assert(count($residentAList) >= 1, "Resident A has their own bookings visible");
    }

    private function testStatusUpdateByStaff(): void {
        $appt = $this->apptService->book(
            $this->residentA['id'],
            'Status update test',
            date('Y-m-d', strtotime('+2 days')),
            '10:00-11:00'
        );
        $result = $this->apptService->updateStatus($appt['id'], 'CONFIRMED', $this->staffUser['id']);
        $this->assert($result['status'] === 'CONFIRMED', "Staff can transition an appointment to CONFIRMED");
    }

    private function testCancellationRecordsReason(): void {
        $appt = $this->apptService->book(
            $this->residentA['id'],
            'Cancellation test',
            date('Y-m-d', strtotime('+3 days')),
            '11:00-12:00'
        );
        $this->apptService->updateStatus($appt['id'], 'CANCELLED', $this->staffUser['id'], 'Resident unavailable');
        $row = $this->apptService->getById($appt['id']);
        $this->assert($row['status'] === 'CANCELLED', "Appointment marked CANCELLED");
        $this->assert(!empty($row['cancellation_reason']), "Cancellation reason persisted");
    }

    private function testAuditLogOnBooking(): void {
        $appt = $this->apptService->book(
            $this->residentA['id'],
            'Audit capture',
            date('Y-m-d', strtotime('+4 days')),
            '13:00-14:00'
        );
        $stmt = $this->pdo->prepare("SELECT action FROM audit_logs WHERE record_id = :id AND action = 'CREATE_APPOINTMENT'");
        $stmt->execute([':id' => $appt['id']]);
        $this->assert($stmt->fetch() !== false, "Booking writes an audit log entry");
    }
}

$testRunner = new AppointmentsSliceTest();
$testRunner->runAll();
