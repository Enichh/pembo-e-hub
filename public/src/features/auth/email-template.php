<!-- features/auth/email-template.php
     Native PHP template for the verification code email. Rendered via
     ob_start()/ob_get_clean() from the auth service. No rendering engine. -->

<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f8fafc; color: #0f172a; line-height: 1.6;">
    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px;">
        <div style="text-align: center; margin-bottom: 20px;">
            <p style="margin: 0; font-weight: 700; color: #1e40af; font-size: 18px;">Pembo e-Hub</p>
            <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Barangay Pembo Services Portal</p>
        </div>

        <h2 style="margin: 0 0 12px; font-size: 20px; color: #0f172a;">Verify your email</h2>
        <p style="margin: 0 0 20px; color: #475569; font-size: 14px;">
            Hello <?= htmlspecialchars($firstName) ?>, use the 6-digit code below to complete your
            registration. This code expires in <?= (int) $expiryMinutes ?> minutes.
        </p>

        <div style="text-align: center; margin: 0 0 20px;">
            <span style="display: inline-block; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #1e3a8a; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 20px;">
                <?= htmlspecialchars($code) ?>
            </span>
        </div>

        <p style="margin: 0 0 8px; color: #94a3b8; font-size: 12px;">
            If you did not request this, you can safely ignore this email. Your account will not be created.
        </p>

        <div style="border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 16px; text-align: center;">
            <p style="margin: 0; color: #64748b; font-size: 12px;">
                &copy; <?= htmlspecialchars($year) ?> Barangay Pembo. All rights reserved.
            </p>
        </div>
    </div>
</div>
