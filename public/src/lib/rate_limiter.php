<?php

declare(strict_types=1);

/**
 * Session-based Rate Limiter Utility
 *
 * Prevents brute-force requests and API spam by tracking attempt timestamps in session storage.
 *
 * @package PemboEHub\Lib
 */
class RateLimiter {
    /**
     * Check if request attempt is permitted under specified limits.
     *
     * @param string $key Unique identifier for the rate limited action (e.g. 'login:127.0.0.1').
     * @param int $maxAttempts Maximum allowed attempts within decay window.
     * @param int $decaySeconds Decay window duration in seconds.
     * @return bool True if attempt is allowed, false if limit exceeded.
     */
    public static function check(string $key, int $maxAttempts = 5, int $decaySeconds = 60): bool {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        $now = time();
        if (!isset($_SESSION['_rate_limits'])) {
            $_SESSION['_rate_limits'] = [];
        }

        if (!isset($_SESSION['_rate_limits'][$key])) {
            $_SESSION['_rate_limits'][$key] = [];
        }

        $_SESSION['_rate_limits'][$key] = array_filter(
            $_SESSION['_rate_limits'][$key],
            fn($timestamp) => ($now - $timestamp) < $decaySeconds
        );

        if (count($_SESSION['_rate_limits'][$key]) >= $maxAttempts) {
            return false;
        }

        $_SESSION['_rate_limits'][$key][] = $now;
        return true;
    }

    /**
     * Clear recorded attempts for a specific key (e.g., on successful login).
     *
     * @param string $key Unique rate limit identifier.
     * @return void
     */
    public static function clear(string $key): void {
        if (isset($_SESSION['_rate_limits'][$key])) {
            unset($_SESSION['_rate_limits'][$key]);
        }
    }
}

