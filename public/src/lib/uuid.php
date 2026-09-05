<?php
// src/lib/uuid.php

declare(strict_types=1);

/**
 * RFC 4122 v4 UUID Generator
 *
 * Shared helper for generating cryptographically secure UUIDv4 identifiers.
 *
 * @package PemboEHub\Lib
 */
final class Uuid {
    /**
     * Generate a RFC 4122 compliant version 4 UUID string.
     *
     * @return string 36-character UUID string (e.g., '123e4567-e89b-12d3-a456-426614174000').
     */
    public static function v4(): string {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // version 4
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // variant 10xx
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}

