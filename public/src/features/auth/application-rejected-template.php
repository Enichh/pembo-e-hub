<!-- features/auth/application-rejected-template.php
     Native PHP template: staff/admin rejected the resident application.
     Rendered via NotificationService. Variables: firstName, reason, year. -->

<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f8fafc; color: #0f172a; line-height: 1.6;">
    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px;">
        <div style="text-align: center; margin-bottom: 20px;">
            <p style="margin: 0; font-weight: 700; color: #1e40af; font-size: 18px;">Pembo e-Hub</p>
            <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Barangay Pembo Services Portal</p>
        </div>

        <h2 style="margin: 0 0 12px; font-size: 20px; color: #991b1b;">Application status update</h2>
        <p style="margin: 0 0 20px; color: #475569; font-size: 14px;">
            Hello <?= htmlspecialchars($firstName) ?>, we're writing regarding your Barangay
            Pembo e-Hub account application. After review, it could not be approved at this time.
        </p>

        <div style="margin: 0 0 20px; padding: 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #7f1d1d; font-size: 14px;">
            <strong>Reason:</strong> <?= htmlspecialchars($reason) ?>
        </div>

        <p style="margin: 0 0 20px; color: #475569; font-size: 14px;">
            If you believe this is an error, or would like to resubmit a Valid ID showing your
            Barangay Pembo address, please visit the Barangay Hall or contact support.
        </p>

        <div style="border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 16px; text-align: center;">
            <p style="margin: 0; color: #64748b; font-size: 12px;">
                &copy; <?= htmlspecialchars($year) ?> Barangay Pembo. All rights reserved.
            </p>
        </div>
    </div>
</div>
