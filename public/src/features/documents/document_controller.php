<?php

declare(strict_types=1);

require_once __DIR__ . '/../../lib/response.php';
require_once __DIR__ . '/../../lib/auth_middleware.php';
require_once __DIR__ . '/document_service.php';

class DocumentController {
    private DocumentService $documentService;

    public function __construct(?DocumentService $documentService = null) {
        $this->documentService = $documentService ?? new DocumentService();
    }

    public function handle(string $action): void {
        switch ($action) {
            case 'document_types':
                $this->getDocumentTypes();
                break;
            case 'list_requests':
                $this->listRequests();
                break;
            case 'get_request':
                $this->getRequest();
                break;
            case 'serve_attachment':
                $this->serveAttachment();
                break;
            case 'create_request':
                $this->createRequest();
                break;
            case 'update_request_status':
                $this->updateStatus();
                break;
            case 'record_payment':
                $this->recordPayment();
                break;
            default:
                Response::error("Unknown document action: {$action}", 404);
        }
    }

    private function getDocumentTypes(): void {
        AuthMiddleware::requireAuth();
        $types = $this->documentService->getDocumentTypes();
        Response::success("Document types retrieved successfully.", $types);
    }

    private function listRequests(): void {
        $currentUser = AuthMiddleware::requireAuth();
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
        $perPage = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 0;
        // Clamp malformed inputs to sane bounds.
        $page = max(0, $page);
        $perPage = max(0, min(100, $perPage));

        // Staff triage filters (server-side narrowing). Residents never pass
        // these; the resident slice ignores them regardless.
        $filters = [];
        foreach (['q', 'status', 'payment'] as $key) {
            if (isset($_GET[$key]) && trim((string)$_GET[$key]) !== '') {
                $filters[$key] = trim((string)$_GET[$key]);
            }
        }

        $requests = $this->documentService->listRequests($currentUser, $page, $perPage, $filters);
        Response::success("Document requests retrieved successfully.", $requests);
    }

    private function getRequest(): void {
        $currentUser = AuthMiddleware::requireAuth();
        $requestId = $_GET['id'] ?? '';
        if (empty($requestId)) {
            Response::error("Request ID is required.", 400);
        }

        try {
            $request = $this->documentService->getRequestById($requestId, $currentUser);
            Response::success("Document request retrieved.", $request);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 403);
        }
    }

    private function serveAttachment(): void {
        $currentUser = AuthMiddleware::requireAuth();
        $attachmentId = $_GET['id'] ?? '';
        if (empty($attachmentId)) {
            Response::error("Attachment ID is required.", 400);
        }

        try {
            $attachment = $this->documentService->getAttachmentToServe($attachmentId, $currentUser);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 403);
        }

        $safeName = str_replace(["\r", "\n", '"'], '', $attachment['file_name']);
        header('Content-Type: ' . $attachment['mime_type']);
        header('Content-Disposition: inline; filename="' . $safeName . '"');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store, private');
        readfile($attachment['file_path']);
        exit;
    }

    private function createRequest(): void {
        $currentUser = AuthMiddleware::requireRole(['RESIDENT']);
        AuthMiddleware::requireCsrf();

        $input = $this->getInput();
        $documentTypeId = (int)($input['document_type_id'] ?? 0);
        $purpose = (string)($input['purpose'] ?? '');
        $uploadedFile = $_FILES['attachment'] ?? null;

        if ($documentTypeId <= 0) {
            Response::error("Please select a valid document type.", 400);
        }

        try {
            $result = $this->documentService->createRequest(
                $currentUser['id'],
                $documentTypeId,
                $purpose,
                $uploadedFile
            );
            Response::success("Document request submitted successfully.", $result, 201);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Exception $e) {
            error_log("Create document request error: " . $e->getMessage());
            Response::error("Failed to submit request: " . $e->getMessage(), 500);
        }
    }

    private function updateStatus(): void {
        $currentUser = AuthMiddleware::requireRole(['STAFF', 'ADMIN']);
        AuthMiddleware::requireCsrf();

        $input = $this->getInput();
        $requestId = $input['request_id'] ?? '';
        $newStatus = $input['status'] ?? '';
        $remarks = $input['remarks'] ?? null;
        $rejectionReason = $input['rejection_reason'] ?? null;

        if (empty($requestId) || empty($newStatus)) {
            Response::error("Request ID and new status are required.", 400);
        }

        try {
            $result = $this->documentService->updateStatus(
                $requestId,
                $newStatus,
                $remarks,
                $rejectionReason,
                $currentUser['id']
            );
            Response::success("Request status updated successfully.", $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Exception $e) {
            error_log("Update request status error: " . $e->getMessage());
            Response::error("Failed to update status: " . $e->getMessage(), 500);
        }
    }

    private function recordPayment(): void {
        $currentUser = AuthMiddleware::requireRole(['STAFF', 'ADMIN']);
        AuthMiddleware::requireCsrf();

        $input = $this->getInput();
        $requestId = $input['request_id'] ?? '';
        $orNumber = isset($input['official_receipt_number']) ? trim((string) $input['official_receipt_number']) : '';
        $amountPaid = isset($input['amount_paid']) ? (float)$input['amount_paid'] : -1.0;
        $remarks = $input['remarks'] ?? null;

        // Official receipt number is auto-generated server-side; it is optional
        // from the client (empty means "generate one").
        if (empty($requestId) || $amountPaid < 0) {
            Response::error("Request ID and a valid amount are required.", 400);
        }

        try {
            $result = $this->documentService->recordPayment(
                $requestId,
                $orNumber,
                $amountPaid,
                $currentUser['id'],
                $remarks
            );
            Response::success("Payment recorded successfully.", $result);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Exception $e) {
            error_log("Record payment error: " . $e->getMessage());
            Response::error("Failed to record payment: " . $e->getMessage(), 500);
        }
    }

    private function getInput(): array {
        $raw = file_get_contents('php://input');
        if (!empty($raw)) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return array_merge($_POST, $decoded);
            }
        }
        return $_POST;
    }
}
