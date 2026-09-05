<?php
// src/lib/mailer.php
// Shared transactional mail helper. One function, no classes, no ceremony.
// Configures Gmail SMTP (port 587 / STARTTLS) and sends whatever HTML string
// the caller passes. Templates live in each feature slice (native PHP files).
//
// SRP: this file OWNS ONLY the SMTP transport. No business rules.

declare(strict_types=1);

require_once __DIR__ . '/env.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

/**
 * Send an HTML email via Gmail SMTP.
 *
 * @throws RuntimeException when PHPMailer is missing, config is incomplete, or
 *         the send fails.
 */
function send_gmail(string $to, string $subject, string $htmlBody): void
{
    $username = Env::get('GMAIL_USER');
    $password = Env::get('GMAIL_APP_PASSWORD');
    $host     = Env::get('SMTP_HOST', 'smtp.gmail.com');
    $port     = (int) Env::get('SMTP_PORT', '587');
    $fromName = Env::get('SMTP_FROM_NAME', 'Pembo e-Hub');

    if ($username === null || $password === null || $password === '') {
        throw new RuntimeException('Email is not configured (GMAIL_USER / GMAIL_APP_PASSWORD).');
    }

    if (!class_exists(PHPMailer::class)) {
        throw new RuntimeException('Mailer dependency (PHPMailer) is not installed. Run `composer install`.');
    }

    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host       = $host;
        $mail->SMTPAuth   = true;
        $mail->Username   = $username;
        $mail->Password   = $password;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $port;

        $mail->setFrom($username, $fromName);
        $mail->addAddress($to);

        $mail->isHTML(true);
        $mail->Subject  = $subject;
        $mail->Body     = $htmlBody;
        $mail->AltBody  = strip_tags($htmlBody);
        $mail->CharSet  = 'UTF-8';

        $mail->send();
    } catch (PHPMailerException $e) {
        error_log('Mail send failure: ' . $e->getMessage());
        throw new RuntimeException('Unable to send email at this time. Please try again.');
    }
}
