<?php
// src/lib/csrf.php

declare(strict_types=1);

/**
 * Cross-Site Request Forgery (CSRF) Protection Utility
 *
 * Handles secure session initialization and token generation/validation.
 *
 * @package PemboEHub\Lib
 */
class CSRF {
    /**
     * Safely initialize PHP session with secure cookie parameters if not started.
     *
     * @return void
     */
    public static function initSession(): void {
        if (session_status() === PHP_SESSION_NONE) {
            if (!headers_sent()) {
                @ini_set('session.cookie_httponly', '1');
                @ini_set('session.use_only_cookies', '1');
                @ini_set('session.cookie_samesite', 'Lax');
                @session_start();
            } else {
                @session_start();
            }
        }
    }

    /**
     * Generate or retrieve existing CSRF token for the session.
     *
     * @return string 64-character hex CSRF token.
     */
    public static function generateToken(): string {
        self::initSession();
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf_token'];
    }

    /**
     * Validate incoming token against stored session token using hash_equals.
     *
     * @param string|null $token Submitted CSRF token.
     * @return bool True if valid, false otherwise.
     */
    public static function validateToken(?string $token): bool {
        self::initSession();
        if (empty($token) || empty($_SESSION['csrf_token'])) {
            return false;
        }
        return hash_equals($_SESSION['csrf_token'], $token);
    }
}

