<!-- features/auth/application-approved-template.php
     Native PHP template: staff/admin approved the resident application.
     Rendered via NotificationService. Variables: firstName, year. -->

<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f8fafc; color: #0f172a; line-height: 1.6;">
    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px;">
        <div style="text-align: center; margin-bottom: 20px;">
            <p style="margin: 0; font-weight: 700; color: #1e40af; font-size: 18px;">Pembo e-Hub</p>
            <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Barangay Pembo Services Portal</p>
        </div>

        <h2 style="margin: 0 0 12px; font-size: 20px; color: #166534;">Your application is approved!</h2>
        <p style="margin: 0 0 20px; color: #475569; font-size: 14px;">
            Hello <?= htmlspecialchars($firstName) ?>, great news! Your Barangay Pembo
            resident account application has been approved. You can now log in to request
            documents, book appointments, and report incidents.
        </p>

        <div style="text-align: center; margin: 0 0 20px;">
            <a href="http://localhost/pembo-e-hub/public/index.html" style="display: inline-block; background: #1e40af; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 700;">Log in to Pembo e-Hub</a>
        </div>

        <div style="border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 16px; text-align: center;">
            <p style="margin: 0; color: #64748b; font-size: 12px;">
                &copy; <?= htmlspecialchars($year) ?> Barangay Pembo. All rights reserved.
            </p>
        </div>
    </div>
</div>
