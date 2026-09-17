<?php

declare(strict_types=1);

/**
 * Version Scope Timestamp Helper Functions - Pembo E-Hub
 *
 * Computes MAX(updated_at) timestamps for near-real-time client polling.
 * Scoped by resident role (when applicable) to prevent cross-resident cache leakage.
 * Uses fail-closed role guarding so any unprivileged or unknown role defaults to caller-only scoping.
 *
 * @package PemboEHub\Lib
 */

/**
 * Retrieve maximum updated_at timestamp for appointments.
 *
 * @param PDO $pdo Active database connection.
 * @param array $user Current authenticated user session.
 * @return int Unix timestamp or 0 if null.
 */
function appointmentsVersion(PDO $pdo, array $user): int {
    $role = strtoupper($user['role_name'] ?? '');
    if ($role !== 'STAFF' && $role !== 'ADMIN') {
        $stmt = $pdo->prepare('SELECT UNIX_TIMESTAMP(MAX(updated_at)) FROM appointments WHERE resident_id = :id');
        $stmt->execute([':id' => $user['id']]);
    } else {
        $stmt = $pdo->query('SELECT UNIX_TIMESTAMP(MAX(updated_at)) FROM appointments');
    }
    $val = $stmt->fetchColumn();
    return $val !== false && $val !== null ? (int)$val : 0;
}

/**
 * Retrieve maximum updated_at timestamp for complaints.
 *
 * @param PDO $pdo Active database connection.
 * @param array $user Current authenticated user session.
 * @return int Unix timestamp or 0 if null.
 */
function complaintsVersion(PDO $pdo, array $user): int {
    $role = strtoupper($user['role_name'] ?? '');
    if ($role !== 'STAFF' && $role !== 'ADMIN') {
        $stmt = $pdo->prepare('SELECT UNIX_TIMESTAMP(MAX(updated_at)) FROM complaints WHERE resident_id = :id');
        $stmt->execute([':id' => $user['id']]);
    } else {
        $stmt = $pdo->query('SELECT UNIX_TIMESTAMP(MAX(updated_at)) FROM complaints');
    }
    $val = $stmt->fetchColumn();
    return $val !== false && $val !== null ? (int)$val : 0;
}

/**
 * Retrieve maximum updated_at timestamp for document requests.
 *
 * @param PDO $pdo Active database connection.
 * @param array $user Current authenticated user session.
 * @return int Unix timestamp or 0 if null.
 */
function documentsVersion(PDO $pdo, array $user): int {
    $role = strtoupper($user['role_name'] ?? '');
    if ($role !== 'STAFF' && $role !== 'ADMIN') {
        $stmt = $pdo->prepare('SELECT UNIX_TIMESTAMP(MAX(updated_at)) FROM document_requests WHERE resident_id = :id');
        $stmt->execute([':id' => $user['id']]);
    } else {
        $stmt = $pdo->query('SELECT UNIX_TIMESTAMP(MAX(updated_at)) FROM document_requests');
    }
    $val = $stmt->fetchColumn();
    return $val !== false && $val !== null ? (int)$val : 0;
}

/**
 * Retrieve maximum updated_at timestamp for emergency SOS reports.
 *
 * @param PDO $pdo Active database connection.
 * @param array $user Current authenticated user session.
 * @return int Unix timestamp or 0 if null.
 */
function emergencyVersion(PDO $pdo, array $user): int {
    $role = strtoupper($user['role_name'] ?? '');
    if ($role !== 'STAFF' && $role !== 'ADMIN') {
        $stmt = $pdo->prepare('SELECT UNIX_TIMESTAMP(MAX(COALESCE(resolved_at, created_at))) FROM emergency_sos WHERE resident_id = :id');
        $stmt->execute([':id' => $user['id']]);
    } else {
        $stmt = $pdo->query('SELECT UNIX_TIMESTAMP(MAX(COALESCE(resolved_at, created_at))) FROM emergency_sos');
    }
    $val = $stmt->fetchColumn();
    return $val !== false && $val !== null ? (int)$val : 0;
}
