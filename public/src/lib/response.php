<?php
// src/lib/response.php

declare(strict_types=1);

/**
 * Standardized JSON API Response Helper
 *
 * Encapsulates HTTP status header sending, JSON encoding, and output termination.
 *
 * @package PemboEHub\Lib
 */
class Response {
    /**
     * Send raw JSON response payload and exit execution.
     *
     * @param array<string, mixed> $data Array payload to encode as JSON.
     * @param int $statusCode HTTP status code (default 200).
     * @return void
     */
    public static function json(array $data, int $statusCode = 200): void {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Send standardized error response payload.
     *
     * @param string $message Main error message.
     * @param int $statusCode HTTP error status code (default 400).
     * @param array<string, string|string[]> $errors Field validation or diagnostic errors.
     * @return void
     */
    public static function error(string $message, int $statusCode = 400, array $errors = []): void {
        $payload = [
            'success' => false,
            'message' => $message,
        ];
        if (!empty($errors)) {
            $payload['errors'] = $errors;
        }
        self::json($payload, $statusCode);
    }

    /**
     * Send standardized success response payload.
     *
     * @param string $message Operation success message.
     * @param array<string, mixed> $data Associated response data.
     * @param int $statusCode HTTP success status code (default 200).
     * @return void
     */
    public static function success(string $message, array $data = [], int $statusCode = 200): void {
        self::json([
            'success' => true,
            'message' => $message,
            'data' => $data,
        ], $statusCode);
    }
}

