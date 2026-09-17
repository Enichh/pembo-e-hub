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
    private array $createdUserIds = [];

    private string $testDate;

    public function __construct() {
        $this->pdo = Database::getConnection();
        $this->authService = new AuthService($this->pdo);
        $this->apptService = new AppointmentsService($this->pdo);
        $this->testDate = date('Y-m-d', strtotime('+' . random_int(50, 250) . ' days'));
    }

    public function runAll(): void {
        echo "\n=== Running Slice 3: Appointments Test Suite ===\n\n";

        try {
            $this->setupTestUsers();
            $this->testAppointmentsTablePresent();
            $this->testSlotAvailabilityReturnsCapacity();
            $this->testResidentBooksAppointment();
            $this->testDuplicateSlotRejectedCleanly();
            $this->testMultipleResidentsCanBookSameSlotWithinCapacity();
            $this->testInvalidTimeSlotRejected();
            $this->testPastDateRejected();
            $this->testStaffListsAll();
            $this->testResidentListsOwnOnly();
            $this->testStatusUpdateByStaff();
            $this->testCancellationRecordsReason();
            $this->testAuditLogOnBooking();
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

    private function tomorrow(): string {
        return $this->testDate;
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
        $this->staffUser = $this->authService->login('admin@pembo.gov.ph', 'Admin12345!');

        $testableAuth = $this->testableAuthService();

        $emailA = 'appt_resident_a_' . time() . '_' . random_int(1000, 9999) . '@pembo.gov.ph';
        $testableAuth->initiateRegistration($emailA, 'Resident12345!', [
            'first_name' => 'Appt',
            'last_name' => 'ResidentA',
            'birthdate' => '1995-01-01',
            'gender' => 'Male',
            'civil_status' => 'Single',
            'street_address' => '123 Appt St',
        ]);
        $this->residentA = $testableAuth->verifyCode($emailA, $testableAuth->lastCode);
        $this->createdUserIds[] = $this->residentA['id'];

        $emailB = 'appt_resident_b_' . time() . '_' . random_int(1000, 9999) . '@pembo.gov.ph';
        $testableAuth->initiateRegistration($emailB, 'Resident12345!', [
            'first_name' => 'Appt',
            'last_name' => 'ResidentB',
            'birthdate' => '1995-01-01',
            'gender' => 'Female',
            'civil_status' => 'Single',
            'street_address' => '456 Appt St',
        ]);
        $this->residentB = $testableAuth->verifyCode($emailB, $testableAuth->lastCode);
        $this->createdUserIds[] = $this->residentB['id'];
    }

    private function tearDown(): void {
        if (!empty($this->createdUserIds)) {
            $inClause = implode(',', array_fill(0, count($this->createdUserIds), '?'));
            $this->pdo->prepare("DELETE FROM appointments WHERE resident_id IN ({$inClause})")->execute($this->createdUserIds);
            $this->pdo->prepare("DELETE FROM resident_profiles WHERE user_id IN ({$inClause})")->execute($this->createdUserIds);
            $this->pdo->prepare("DELETE FROM users WHERE id IN ({$inClause})")->execute($this->createdUserIds);
        }
    }

    private function testAppointmentsTablePresent(): void {
        $stmt = $this->pdo->query("SELECT 1 FROM appointments LIMIT 0");
        $this->assert($stmt !== false, "appointments table is queryable");
    }

    private function testSlotAvailabilityReturnsCapacity(): void {
        $slots = $this->apptService->getSlotAvailability($this->tomorrow());
        $this->assert(count($slots) === count(AppointmentsService::SLOTS), "getSlotAvailability returns all time windows");
        $first = $slots[0];
        $this->assert(isset($first['capacity']) && $first['capacity'] === AppointmentsService::DEFAULT_SLOT_CAPACITY, "Slot includes DEFAULT_SLOT_CAPACITY");
        $this->assert(isset($first['remaining']) && $first['remaining'] === $first['capacity'], "Initial slot remaining equals capacity");
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
        // Resident A books the same date+slot a second time -> must be rejected cleanly.
        $blocked = false;
        try {
            $this->apptService->book(
                $this->residentA['id'],
                'Duplicate booking',
                $this->tomorrow(),
                '09:00-10:00'
            );
        } catch (InvalidArgumentException $e) {
            $blocked = str_contains(strtolower($e->getMessage()), 'appointment') || str_contains(strtolower($e->getMessage()), 'slot');
        }
        $this->assert($blocked, "Duplicate resident/date/slot rejected with a clean message");
    }

    private function testMultipleResidentsCanBookSameSlotWithinCapacity(): void {
        // Resident B books the same date/slot -> allowed because multi-capacity quota is in place.
        $ok = false;
        try {
            $appt = $this->apptService->book(
                $this->residentB['id'],
                'Different person booking',
                $this->tomorrow(),
                '09:00-10:00'
            );
            $ok = !empty($appt['id']);
        } catch (InvalidArgumentException $e) {
            $ok = false;
        }
        $this->assert($ok, "Multiple constituents can book within the slot capacity");

        // Verify remaining count decrements properly
        $slots = $this->apptService->getSlotAvailability($this->tomorrow());
        $slot09 = null;
        foreach ($slots as $s) {
            if ($s['slot'] === '09:00-10:00') {
                $slot09 = $s;
                break;
            }
        }
        $this->assert($slot09 !== null && $slot09['booked'] === 2 && $slot09['remaining'] === (AppointmentsService::DEFAULT_SLOT_CAPACITY - 2), "Slot booked count is 2 and remaining is capacity - 2");
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
        $this->assert(count($all) >= 2, "Staff can list appointments for a date");
    }

    private function testResidentListsOwnOnly(): void {
        // Resident A only sees rows they own — never other residents'.
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
