<?php

declare(strict_types=1);

require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/response.php';

/**
 * Authentication and Authorization Middleware
 *
 * Provides session validation, role-based access control (RBAC),
 * and HTTP anti-CSRF enforcement.
 *
 * @package PemboEHub\Lib
 */
class AuthMiddleware {
    /**
     * Retrieve current logged-in user session array if active.
     *
     * @return array{id: string, email: string, role_id: int, role_name: string}|null User session array or null.
     */
    public static function getCurrentUser(): ?array {
        CSRF::initSession();
        return $_SESSION['auth_user'] ?? null;
    }

    /**
     * Require an authenticated session; terminates request with HTTP 401 if unauthenticated.
     *
     * @return array{id: string, email: string, role_id: int, role_name: string} Authenticated user array.
     */
    public static function requireAuth(): array {
        $user = self::getCurrentUser();
        if (!$user) {
            Response::error("Unauthorized. Please log in to access this resource.", 401);
        }
        return $user;
    }

    /**
     * Require specified user role(s); terminates request with HTTP 403 if role is unauthorized.
     *
     * @param string[] $allowedRoles Case-insensitive list of permitted role names (e.g., ['RESIDENT', 'STAFF', 'ADMIN']).
     * @return array{id: string, email: string, role_id: int, role_name: string} Authenticated and authorized user array.
     */
    public static function requireRole(array $allowedRoles): array {
        $user = self::requireAuth();
        $userRole = strtoupper($user['role_name'] ?? '');

        $normalizedAllowed = array_map('strtoupper', $allowedRoles);
        if (!in_array($userRole, $normalizedAllowed, true)) {
            Response::error("Forbidden. You do not have permission to access this resource.", 403);
        }

        return $user;
    }

    /**
     * Enforce CSRF token validation on state-modifying HTTP methods (POST, PUT, DELETE, PATCH).
     *
     * @return void
     */
    public static function requireCsrf(): void {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        if (in_array($method, ['POST', 'PUT', 'DELETE', 'PATCH'], true)) {
            $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? null;
            if (!CSRF::validateToken($token)) {
                Response::error("Invalid or missing CSRF token. Request rejected.", 403);
            }
        }
    }
}

