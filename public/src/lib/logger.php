<?php
// src/lib/logger.php

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

class Logger {
    public static function audit(
        ?string $userId,
        string $action,
        string $tableName,
        string $recordId,
        ?array $oldValues = null,
        ?array $newValues = null
    ): void {
        try {
            $pdo = Database::getConnection();
            $ipAddress = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'CLI/System';

            $stmt = $pdo->prepare("
                INSERT INTO audit_logs (
                    user_id, ip_address, user_agent, action, table_name, record_id, old_values, new_values, timestamp
                ) VALUES (
                    :user_id, :ip_address, :user_agent, :action, :table_name, :record_id, :old_values, :new_values, NOW()
                )
            ");

            $stmt->execute([
                ':user_id' => $userId,
                ':ip_address' => $ipAddress,
                ':user_agent' => $userAgent,
                ':action' => $action,
                ':table_name' => $tableName,
                ':record_id' => $recordId,
                ':old_values' => $oldValues !== null ? json_encode($oldValues, JSON_UNESCAPED_UNICODE) : null,
                ':new_values' => $newValues !== null ? json_encode($newValues, JSON_UNESCAPED_UNICODE) : null,
            ]);
        } catch (Exception $e) {
            // Write to system error log without breaking client operation
            error_log("Audit logging failed: " . $e->getMessage());
        }
    }

    public static function log(string $level, string $message, array $context = []): void {
        $timestamp = date('Y-m-d H:i:s');
        $contextStr = !empty($context) ? ' ' . json_encode($context) : '';
        error_log("[{$timestamp}] [{$level}] {$message}{$contextStr}");
    }
}
