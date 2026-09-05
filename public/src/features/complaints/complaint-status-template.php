<!-- features/complaints/complaint-status-template.php
     Native PHP template: complaint status change.
     Rendered via NotificationService. Variables: firstName, complaintNumber,
     incidentType, status, hearingDate, year. -->

<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f8fafc; color: #0f172a; line-height: 1.6;">
    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px;">
        <div style="text-align: center; margin-bottom: 20px;">
            <p style="margin: 0; font-weight: 700; color: #1e40af; font-size: 18px;">Pembo e-Hub</p>
            <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Barangay Pembo Services Portal</p>
        </div>

        <h2 style="margin: 0 0 12px; font-size: 20px; color: #0f172a;">Complaint update</h2>
        <p style="margin: 0 0 20px; color: #475569; font-size: 14px;">
            Hello <?= htmlspecialchars($firstName) ?>, there is an update to your complaint.
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px; font-size: 14px; color: #334155;">
            <tr><td style="padding: 6px 0; color: #64748b;">Reference</td><td style="padding: 6px 0; text-align: right; font-weight: 600;"><?= htmlspecialchars($complaintNumber) ?></td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Incident type</td><td style="padding: 6px 0; text-align: right; font-weight: 600;"><?= htmlspecialchars($incidentType) ?></td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Status</td><td style="padding: 6px 0; text-align: right; font-weight: 700;"><?= htmlspecialchars($status) ?></td></tr>
            <?php if (!empty($hearingDate)): ?>
                <tr><td style="padding: 6px 0; color: #64748b;">Hearing date</td><td style="padding: 6px 0; text-align: right; font-weight: 600;"><?= htmlspecialchars($hearingDate) ?></td></tr>
            <?php endif; ?>
        </table>

        <div style="border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 16px; text-align: center;">
            <p style="margin: 0; color: #64748b; font-size: 12px;">
                &copy; <?= htmlspecialchars($year) ?> Barangay Pembo. All rights reserved.
            </p>
        </div>
    </div>
</div>
