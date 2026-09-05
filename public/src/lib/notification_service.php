<?php
// src/lib/notification_service.php
// Centralized transactional email notification service.
//
// SRP: this class OWNS ONLY the "send an email to a resident" concern. It is
// the single place that knows HOW to send (via the shared mailer) and WHEN to
// send (a single enable/disable toggle). All email templates and the resident-
// facing copy live here so feature slices stay free of inline HTML strings.
//
// Feature slices call the semantic methods below; they never call send_gmail()
// directly, and they never re-check an enable flag themselves.

declare(strict_types=1);

require_once __DIR__ . '/env.php';
require_once __DIR__ . '/mailer.php';

final class NotificationService
{
    private bool $enabled;

    public function __construct(?bool $enabled = null)
    {
        // One shared toggle. Feature services construct this without args and
        // get the environment default; test harnesses may pass false to disable
        // delivery while still exercising the code path.
        $this->enabled = $enabled ?? $this->readEnabledFromEnv();
    }

    /** Determine whether email delivery is enabled from the environment. */
    private function readEnabledFromEnv(): bool
    {
        $raw = Env::get('MAIL_ENABLED', 'true');
        return !in_array(strtolower(trim($raw)), ['0', 'false', 'no', 'off'], true);
    }

    /**
     * Send a single HTML email, swallowing transport failures so a notification
     * can never break the primary business flow (e.g. registration).
     */
    private function deliver(string $to, string $subject, callable $renderBody): void
    {
        if (!$this->enabled) {
            return;
        }

        try {
            send_gmail($to, $subject, $renderBody());
        } catch (\Throwable $e) {
            error_log('NotificationService: failed to send "' . $subject . '" to ' . $to . ': ' . $e->getMessage());
        }
    }

    /**
     * Render a native PHP template with the given variables into an HTML string.
     *
     * @param string $template Absolute path to the template file.
     * @param array<string, mixed> $vars Variables exposed to the template.
     */
    private function render(string $template, array $vars): string
    {
        extract($vars, EXTR_SKIP);
        ob_start();
        require $template;
        return (string) ob_get_clean();
    }

    // ---------------------------------------------------------------------
    // Public notification API
    // ---------------------------------------------------------------------

    /**
     * 6-digit code emailed to complete registration (phase 1).
     */
    public function verificationCode(string $email, string $firstName, string $code, int $expiryMinutes): void
    {
        $this->deliver($email, 'Your Pembo e-Hub verification code', function () use ($firstName, $code, $expiryMinutes) {
            return $this->render(__DIR__ . '/../features/auth/email-template.php', [
                'firstName' => $firstName,
                'code' => $code,
                'expiryMinutes' => $expiryMinutes,
                'year' => date('Y'),
            ]);
        });
    }

    /**
     * 6-digit code emailed to reset a password.
     */
    public function passwordResetCode(string $email, string $code, int $expiryMinutes): void
    {
        $this->deliver($email, 'Reset your Pembo e-Hub password', function () use ($code, $expiryMinutes) {
            return $this->render(__DIR__ . '/../features/auth/reset-email-template.php', [
                'code' => $code,
                'expiryMinutes' => $expiryMinutes,
                'year' => date('Y'),
            ]);
        });
    }

    /**
     * Confirmation that a registration application was received and is now
     * queued for manual staff review.
     */
    public function applicationUnderReview(string $email, string $firstName): void
    {
        $this->deliver($email, 'Application received - Pending Verification', function () use ($firstName) {
            return $this->render(__DIR__ . '/../features/auth/application-under-review-template.php', [
                'firstName' => $firstName,
                'year' => date('Y'),
            ]);
        });
    }

    /**
     * Confirmation that staff/admin approved the resident application.
     */
    public function applicationApproved(string $email, string $firstName): void
    {
        $this->deliver($email, 'Your application is approved', function () use ($firstName) {
            return $this->render(__DIR__ . '/../features/auth/application-approved-template.php', [
                'firstName' => $firstName,
                'year' => date('Y'),
            ]);
        });
    }

    /**
     * Notification that staff/admin rejected the resident application.
     */
    public function applicationRejected(string $email, string $firstName, string $reason): void
    {
        $this->deliver($email, 'Application status update', function () use ($firstName, $reason) {
            return $this->render(__DIR__ . '/../features/auth/application-rejected-template.php', [
                'firstName' => $firstName,
                'reason' => $reason,
                'year' => date('Y'),
            ]);
        });
    }

    /**
     * Notify a resident that their document request's status changed.
     *
     * @param string $newStatus One of PENDING/VERIFYING/APPROVED/READY_FOR_PICKUP/COMPLETED/REJECTED/CANCELLED.
     * @param string|null $reason Rejection reason when REJECTED.
     */
    public function documentStatusChanged(string $email, string $firstName, string $trackingNumber, string $documentName, string $newStatus, ?string $reason = null): void
    {
        $this->deliver($email, 'Update on your document request ' . $trackingNumber, function () use ($firstName, $trackingNumber, $documentName, $newStatus, $reason) {
            return $this->render(__DIR__ . '/../features/documents/document-status-template.php', [
                'firstName' => $firstName,
                'trackingNumber' => $trackingNumber,
                'documentName' => $documentName,
                'status' => $newStatus,
                'reason' => $reason,
                'year' => date('Y'),
            ]);
        });
    }

    /**
     * Notify a resident that their document request payment was recorded.
     * Deliberately avoids the phrase "official receipt".
     */
    public function paymentRecorded(string $email, string $firstName, string $trackingNumber, string $documentName, string $referenceNumber, string $amountPaid): void
    {
        $this->deliver($email, 'Payment confirmed for request ' . $trackingNumber, function () use ($firstName, $trackingNumber, $documentName, $referenceNumber, $amountPaid) {
            return $this->render(__DIR__ . '/../features/documents/payment-confirmation-template.php', [
                'firstName' => $firstName,
                'trackingNumber' => $trackingNumber,
                'documentName' => $documentName,
                'referenceNumber' => $referenceNumber,
                'amountPaid' => $amountPaid,
                'year' => date('Y'),
            ]);
        });
    }

    /**
     * Notify a resident that their appointment status changed.
     *
     * @param string|null $reason Cancellation reason when CANCELLED.
     */
    public function appointmentStatusChanged(string $email, string $firstName, string $serviceType, string $date, string $timeSlot, string $newStatus, ?string $reason = null): void
    {
        $this->deliver($email, 'Update on your appointment', function () use ($firstName, $serviceType, $date, $timeSlot, $newStatus, $reason) {
            return $this->render(__DIR__ . '/../features/appointments/appointment-status-template.php', [
                'firstName' => $firstName,
                'serviceType' => $serviceType,
                'date' => $date,
                'timeSlot' => $timeSlot,
                'status' => $newStatus,
                'reason' => $reason,
                'year' => date('Y'),
            ]);
        });
    }

    /**
     * Notify a resident that their complaint status changed.
     */
    public function complaintStatusChanged(string $email, string $firstName, string $complaintNumber, string $incidentType, string $newStatus, ?string $hearingDate = null): void
    {
        $this->deliver($email, 'Update on your complaint ' . $complaintNumber, function () use ($firstName, $complaintNumber, $incidentType, $newStatus, $hearingDate) {
            return $this->render(__DIR__ . '/../features/complaints/complaint-status-template.php', [
                'firstName' => $firstName,
                'complaintNumber' => $complaintNumber,
                'incidentType' => $incidentType,
                'status' => $newStatus,
                'hearingDate' => $hearingDate,
                'year' => date('Y'),
            ]);
        });
    }
}
