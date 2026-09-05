<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/src/config/database.php';
require_once __DIR__ . '/../public/src/features/auth/auth_service.php';
require_once __DIR__ . '/../public/src/features/documents/document_service.php';
require_once __DIR__ . '/../public/src/lib/csrf.php';

class DocumentSliceTest {
    private PDO $pdo;
    private AuthService $authService;
    private DocumentService $docService;
    private int $passed = 0;
    private int $failed = 0;

    private array $adminUser;
    private array $staffUser;
    private array $residentUserA;
    private array $residentUserB;

    public function __construct() {
        $this->pdo = Database::getConnection();
        $this->authService = new AuthService($this->pdo);
        $this->docService = new DocumentService($this->pdo);
    }

    public function runAll(): void {
        echo "\n=== Running Slice 2: Resident Services (Documents) Test Suite ===\n\n";

        $this->setupTestUsers();
        $this->testDocumentTypesSeeded();
        $this->testCreateDocumentRequestWithoutFile();
        $this->testCreateDocumentRequestWithFile();
        $this->testCreateRequestValidation();
        $this->testIdorProtectionOnGetRequest();
        $this->testStaffCanViewAnyRequest();
        $this->testStaffListRequestsStatusFilter();
        $this->testStaffListRequestsSearchAndPagination();
        $this->testStaffListRequestsPaymentFilter();
        $this->testAtomicStatusUpdateByStaff();
        $this->testRecordPaymentByStaff();
        $this->testDuplicatePaymentRejection();
        $this->testAttachmentServingAuthorization();

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
        $this->adminUser = $this->authService->login('admin@pembo.gov.ph', 'Admin12345!');
        $this->staffUser = $this->authService->login('staff@pembo.gov.ph', 'Staff12345!');
        $this->residentUserA = $this->authService->login('resident@pembo.gov.ph', 'Resident12345!');

        // Register Resident B for IDOR testing
        $emailB = 'resident_b_' . time() . '@pembo.gov.ph';
        $testableAuth = $this->testableAuthService();
        $testableAuth->initiateRegistration($emailB, 'Resident12345!', [
            'first_name' => 'Resident',
            'last_name' => 'B',
            'birthdate' => '1995-01-01',
            'gender' => 'Female',
            'civil_status' => 'Single',
            'street_address' => '456 Pembo St',
        ]);
        $this->residentUserB = $testableAuth->verifyCode($emailB, $testableAuth->lastCode);
    }

    private function testDocumentTypesSeeded(): void {
        $types = $this->docService->getDocumentTypes();
        $names = array_column($types, 'name');
        
        $hasClearance = in_array('Barangay Clearance', $names, true);
        $hasResidency = in_array('Certificate of Residency', $names, true);
        $hasIndigency = in_array('Certificate of Indigency', $names, true);
        $hasCedula = in_array('Community Tax Certificate (Cedula)', $names, true);

        $this->assert($hasClearance && $hasResidency && $hasIndigency && $hasCedula, "Document types (Clearance, Residency, Indigency, Cedula) are seeded");
    }

    /**
     * Build a reusable mock upload for a valid 1x1 PNG (accepted MIME/type).
     */
    private function mockValidAttachment(): array {
        $tempFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'test_id_' . time() . '_' . rand(100, 999) . '.png';
        file_put_contents($tempFile, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));
        return [
            'name' => 'valid_id.png',
            'type' => 'image/png',
            'tmp_name' => $tempFile,
            'error' => UPLOAD_ERR_OK,
            'size' => filesize($tempFile),
        ];
    }

    private function testCreateDocumentRequestWithoutFile(): void {
        // Valid ID upload is now REQUIRED — submitting without one must be rejected.
        $rejected = false;
        try {
            $this->docService->createRequest(
                $this->residentUserA['id'],
                1, // Barangay Clearance
                'Employment requirement'
            );
        } catch (InvalidArgumentException $e) {
            $rejected = true;
        }
        $this->assert($rejected, "Request rejected when supporting document / Valid ID is missing");
    }

    private function testCreateDocumentRequestWithFile(): void {
        $mockFile = $this->mockValidAttachment();
        $res = $this->docService->createRequest(
            $this->residentUserA['id'],
            1, // Barangay Clearance
            'Employment requirement',
            $mockFile
        );

        $this->assert(!empty($res['id']), "Request ID is generated");
        $this->assert(str_starts_with($res['tracking_number'], 'PEM-'), "Tracking number matches PEM format");
        $this->assert($res['status'] === 'PENDING', "Initial status is PENDING");

        // Verify status history row was created atomically
        $stmtHist = $this->pdo->prepare("SELECT new_status FROM request_status_history WHERE request_id = :id");
        $stmtHist->execute([':id' => $res['id']]);
        $hist = $stmtHist->fetch();
        $this->assert($hist && $hist['new_status'] === 'PENDING', "Initial status history entry logged atomically");

        // Verify audit log
        $stmtAudit = $this->pdo->prepare("SELECT action FROM audit_logs WHERE record_id = :id AND action = 'CREATE_DOCUMENT_REQUEST'");
        $stmtAudit->execute([':id' => $res['id']]);
        $audit = $stmtAudit->fetch();
        $this->assert(!empty($audit), "Audit log created for document request submission");

        // Attach record must persist the uploaded Valid ID
        $stmtAttach = $this->pdo->prepare("SELECT file_name, mime_type, file_path FROM request_attachments WHERE request_id = :id");
        $stmtAttach->execute([':id' => $res['id']]);
        $attach = $stmtAttach->fetch();
        $this->assert(!empty($attach), "Attachment record created in database");
        $this->assert($attach['mime_type'] === 'image/png', "MIME type validated and recorded as image/png");
        $this->assert(file_exists($attach['file_path']), "Uploaded file saved to secure non-public storage directory");
    }

    private function testCreateRequestValidation(): void {
        $failed = false;
        try {
            $this->docService->createRequest($this->residentUserA['id'], 99999, 'Invalid doc type');
        } catch (InvalidArgumentException $e) {
            $failed = true;
        }
        $this->assert($failed, "Request rejected for non-existent document type");

        $emptyPurposeFailed = false;
        try {
            $this->docService->createRequest($this->residentUserA['id'], 1, '');
        } catch (InvalidArgumentException $e) {
            $emptyPurposeFailed = true;
        }
        $this->assert($emptyPurposeFailed, "Request rejected when purpose is empty");
    }

    private function testIdorProtectionOnGetRequest(): void {
        // Create request belonging to Resident A
        $reqA = $this->docService->createRequest(
            $this->residentUserA['id'],
            1,
            'Resident A Confidential Request',
            $this->mockValidAttachment()
        );

        // Resident B attempts to access Resident A's request
        $blocked = false;
        try {
            $this->docService->getRequestById($reqA['id'], $this->residentUserB);
        } catch (RuntimeException $e) {
            $blocked = true;
        }

        $this->assert($blocked, "IDOR Guard: Resident B cannot view Resident A's document request");

        // Resident A accesses own request
        $accessed = $this->docService->getRequestById($reqA['id'], $this->residentUserA);
        $this->assert($accessed['id'] === $reqA['id'], "Resident A can view own document request");
    }

    private function testStaffCanViewAnyRequest(): void {
        $reqA = $this->docService->createRequest(
            $this->residentUserA['id'],
            1,
            'Staff Review Test',
            $this->mockValidAttachment()
        );

        $staffView = $this->docService->getRequestById($reqA['id'], $this->staffUser);
        $this->assert($staffView['id'] === $reqA['id'], "Staff can view any resident's document request");
    }

    /**
     * Create a document request for Resident B and open a PDO handle to it so
     * the test can later read back its created status without a second hit on
     * the resident ID. Returns ['id','tracking_number','resident_email'].
     */
    private function createRequestForB(string $purpose): array {
        $res = $this->docService->createRequest(
            $this->residentUserB['id'],
            1, // Barangay Clearance
            $purpose,
            $this->mockValidAttachment()
        );
        return [
            'id' => $res['id'],
            'tracking_number' => $res['tracking_number'],
            'resident_email' => $this->residentUserB['email'],
        ];
    }

    private function testStaffListRequestsStatusFilter(): void {
        // A freshly created request is unambiguously PENDING (no earlier suite
        // mutations touch it), so we can prove the status filter narrows results.
        $rk = $this->createRequestForB('Staff status filter seed');

        $pending = $this->docService->listRequests($this->staffUser, 1, 200, ['status' => 'PENDING']);
        $this->assert(isset($pending['data'], $pending['meta']), "Paginated staff list returns an envelope (data + meta)");
        $this->assert((int)$pending['meta']['total'] >= 1, "Status filter returns at least one PENDING request");

        $allStatusPending = count(array_filter($pending['data'] ?? [], function ($row) {
            return $row['status'] !== 'PENDING';
        })) === 0;
        $this->assert($allStatusPending, "Status=PENDING filter returns only PENDING requests");

        // A strict-subset/negative proof: the unfiltered queue includes far more
        // than just PENDING rows; compare a specific known request to show the
        // filter removes it only when the chosen status doesn't match.
        $approved = $this->docService->listRequests($this->staffUser, 1, 200, ['status' => 'APPROVED']);
        $approvedIds = array_column($approved['data'] ?? [], 'id');
        $this->assert(!in_array($rk['id'], $approvedIds, true), "Status=APPROVED filter excludes the PENDING seed row");
    }

    private function testStaffListRequestsSearchAndPagination(): void {
        // Uniquely searchable B-email seed guarantees exactly-one-match semantics.
        $rk = $this->createRequestForB('Staff Q search seed');

        // Searching only B's (unique) email must exclude every OTHER resident's
        // request — i.e. the filter is a real narrowing, not a full-list echo.
        $byEmail = $this->docService->listRequests($this->staffUser, 1, 200, ['q' => $this->residentUserB['email']]);
        $rowsByEmail = $byEmail['data'] ?? [];
        $this->assert(count($rowsByEmail) >= 1, "q=resident email returns at least the seeded B request");
        $onlyB = count(array_filter($rowsByEmail, function ($row) {
            return stripos($row['resident_email'], $this->residentUserB['email']) === false;
        })) === 0;
        $this->assert($onlyB, "q=resident email excludes all other residents' requests");
        $this->assert(in_array($rk['id'], array_column($rowsByEmail, 'id'), true), "q=resident email surfaces the seeded request");

        // Search by a tracking-number substring that only the seed request has.
        $suffix = substr($rk['tracking_number'], -6);
        $byTracking = $this->docService->listRequests($this->staffUser, 1, 200, ['q' => $suffix]);
        $trackIds = array_column($byTracking['data'] ?? [], 'id');
        $this->assert(count($trackIds) === 1 && $trackIds[0] === $rk['id'], "q=unique tracking substring matches the seed row exactly once");

        // Pagination integrity: per_page=1 yields one row and sane totals.
        $envelope = $this->docService->listRequests($this->staffUser, 1, 1);
        $this->assert(is_array($envelope['data'] ?? null) && count($envelope['data']) === 1, "per_page=1 returns a single row");
        $this->assert((int)$envelope['meta']['total_pages'] >= (int)$envelope['meta']['page'], "Envelope reports valid total_pages");
        $this->assert((int)$envelope['meta']['per_page'] === 1, "Envelope echoes requested per_page");
    }

    private function testStaffListRequestsPaymentFilter(): void {
        // Seed an UNPAID request, then pay it via recordPayment and verify the
        // payment filter flips its membership between UNPAID and PAID buckets.
        $rk = $this->createRequestForB('Staff payment filter seed');
        $orNumber = 'OR-TEST-' . strtoupper(bin2hex(random_bytes(3)));
        $this->docService->recordPayment($rk['id'], $orNumber, 50.00, $this->staffUser['id']);

        $unpaid = $this->docService->listRequests($this->staffUser, 1, 200, ['payment' => 'UNPAID']);
        $unpaidIds = array_column($unpaid['data'] ?? [], 'id');
        $this->assert(!in_array($rk['id'], $unpaidIds, true), "payment=UNPAID excludes the now-PAID seed row");
        $unpaidAllUnpaid = count(array_filter($unpaid['data'] ?? [], function ($row) {
            return ($row['payment_status'] ?? null) !== 'PAID';
        })) === count($unpaid['data'] ?? []);
        $this->assert($unpaidAllUnpaid, "payment=UNPAID rows are all unpaid");

        $paid = $this->docService->listRequests($this->staffUser, 1, 200, ['payment' => 'PAID']);
        $onlyPaid = count(array_filter($paid['data'] ?? [], function ($row) {
            return ($row['payment_status'] ?? null) !== 'PAID';
        })) === 0;
        $this->assert($onlyPaid, "payment=PAID returns only paid rows");
        $paidRows = array_filter($paid['data'] ?? [], function ($row) use ($rk) {
            return $row['id'] === $rk['id'];
        });
        $this->assert(count($paidRows) === 1, "payment=PAID includes the paid seed row");
    }

    private function testAtomicStatusUpdateByStaff(): void {
        $req = $this->docService->createRequest(
            $this->residentUserA['id'],
            1,
            'Status transition test',
            $this->mockValidAttachment()
        );

        // Update to APPROVED
        $updated = $this->docService->updateStatus(
            $req['id'],
            'APPROVED',
            'All submitted requirements verified.',
            null,
            $this->staffUser['id']
        );

        $this->assert($updated['status'] === 'APPROVED', "Staff updated request status to APPROVED");
        $this->assert($updated['previous_status'] === 'PENDING', "Previous status captured correctly");

        // Check history
        $stmtHist = $this->pdo->prepare("SELECT previous_status, new_status, remarks FROM request_status_history WHERE request_id = :id AND new_status = 'APPROVED'");
        $stmtHist->execute([':id' => $req['id']]);
        $hist = $stmtHist->fetch();

        $this->assert(!empty($hist) && $hist['previous_status'] === 'PENDING', "Status transition history recorded atomically");

        // Check audit log
        $stmtAudit = $this->pdo->prepare("SELECT action FROM audit_logs WHERE record_id = :id AND action = 'UPDATE_DOCUMENT_STATUS'");
        $stmtAudit->execute([':id' => $req['id']]);
        $audit = $stmtAudit->fetch();
        $this->assert(!empty($audit), "Audit log recorded for status transition");
    }

    private function testRecordPaymentByStaff(): void {
        $req = $this->docService->createRequest(
            $this->residentUserA['id'],
            1, // Clearance (50.00)
            'Payment recording test',
            $this->mockValidAttachment()
        );

        $orNumber = 'OR-' . date('Ymd') . '-' . rand(1000, 9999);
        $payResult = $this->docService->recordPayment(
            $req['id'],
            $orNumber,
            50.00,
            $this->staffUser['id'],
            'Cash payment at Barangay Hall Counter 1'
        );

        $this->assert($payResult['official_receipt_number'] === $orNumber, "Payment recorded with official receipt number");
        $this->assert($payResult['payment_status'] === 'PAID', "Payment status set to PAID");

        // Verify request details now include payment info
        $view = $this->docService->getRequestById($req['id'], $this->staffUser);
        $this->assert($view['official_receipt_number'] === $orNumber, "Request details include linked payment record");
    }

    private function testDuplicatePaymentRejection(): void {
        $req1 = $this->docService->createRequest($this->residentUserA['id'], 1, 'Dup payment test 1', $this->mockValidAttachment());
        $req2 = $this->docService->createRequest($this->residentUserA['id'], 1, 'Dup payment test 2', $this->mockValidAttachment());

        $orNumber = 'OR-DUP-' . time();
        $this->docService->recordPayment($req1['id'], $orNumber, 50.00, $this->staffUser['id']);

        // Attempt duplicate OR number
        $dupOrRejected = false;
        try {
            $this->docService->recordPayment($req2['id'], $orNumber, 50.00, $this->staffUser['id']);
        } catch (InvalidArgumentException $e) {
            $dupOrRejected = true;
        }
        $this->assert($dupOrRejected, "Duplicate official receipt (OR) number rejected");

        // Attempt double payment on same request
        $doublePayRejected = false;
        try {
            $this->docService->recordPayment($req1['id'], 'OR-ANOTHER-' . time(), 50.00, $this->staffUser['id']);
        } catch (InvalidArgumentException $e) {
            $doublePayRejected = true;
        }
        $this->assert($doublePayRejected, "Double payment on same document request rejected");
    }

    private function testAttachmentServingAuthorization(): void {
        // Create an image attachment owned by Resident A.
        $tempDir = sys_get_temp_dir();
        $tempFile = $tempDir . DIRECTORY_SEPARATOR . 'serve_id_' . time() . '.png';
        file_put_contents($tempFile, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));

        $req = $this->docService->createRequest(
            $this->residentUserA['id'],
            1,
            'Attachment serving authz test',
            [
                'name' => 'serve_target.png',
                'type' => 'image/png',
                'tmp_name' => $tempFile,
                'error' => UPLOAD_ERR_OK,
                'size' => filesize($tempFile),
            ]
        );

        $stmt = $this->pdo->prepare("SELECT id FROM request_attachments WHERE request_id = :id");
        $stmt->execute([':id' => $req['id']]);
        $attachmentId = $stmt->fetchColumn();
        $this->assert(!empty($attachmentId), "Attachment ID available for serving test");

        // Staff may resolve the attachment to serve.
        $servable = $this->docService->getAttachmentToServe($attachmentId, $this->staffUser);
        $this->assert(isset($servable['file_path']) && file_exists($servable['file_path']), "Staff can serve attachment file");
        $this->assert($servable['mime_type'] === 'image/png', "Served attachment carries its validated MIME type");

        // Owning resident may view their own attachment.
        $ownerView = $this->docService->getAttachmentToServe($attachmentId, $this->residentUserA);
        $this->assert(!empty($ownerView), "Owning resident can view their own attachment");

        // Another resident must NOT be able to reach Resident A's attachment (IDOR).
        $blocked = false;
        try {
            $this->docService->getAttachmentToServe($attachmentId, $this->residentUserB);
        } catch (RuntimeException $e) {
            $blocked = true;
        }
        $this->assert($blocked, "IDOR Guard: Resident B cannot fetch Resident A's upload");
    }
}

$testRunner = new DocumentSliceTest();
$testRunner->runAll();
