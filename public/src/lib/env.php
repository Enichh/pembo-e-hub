<?php
// src/lib/env.php
// Loads environment configuration from a `.env` file into the process
// environment. Uses vlucas/phpdotenv when available (Composer), and degrades
// gracefully to getenv() if the dependency has not been installed yet.
//
// SRP: this file OWNS ONLY environment loading. No business logic.

declare(strict_types=1);

final class Env {
    private static bool $loaded = false;

    /**
     * Load `.env` (if present) and make values available via $_ENV / getenv().
     * Idempotent: safe to call multiple times.
     */
    public static function load(string $projectRoot): void {
        if (self::$loaded) {
            return;
        }
        self::$loaded = true;

        $envFile = rtrim($projectRoot, '/\\') . DIRECTORY_SEPARATOR . '.env';
        if (!is_file($envFile)) {
            return; // no .env file; rely on real environment variables.
        }

        $autoload = rtrim($projectRoot, '/\\') . DIRECTORY_SEPARATOR
            . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';

        if (is_file($autoload) && class_exists(\Dotenv\Dotenv::class)) {
            \Dotenv\Dotenv::createImmutable($projectRoot)->safeLoad();
            return;
        }

        // Fallback: minimal .env parser (KEY=VALUE, ignore comments/blank lines).
        self::parseFallback($envFile);
    }

    private static function parseFallback(string $envFile): void {
        foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            $eq = strpos($line, '=');
            if ($eq === false) {
                continue;
            }
            $key = trim(substr($line, 0, $eq));
            $value = trim(substr($line, $eq + 1));
            // Strip surrounding quotes (single or double).
            if (strlen($value) >= 2) {
                $first = $value[0];
                $last = $value[strlen($value) - 1];
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $value = substr($value, 1, -1);
                }
            }
            putenv("{$key}={$value}");
            $_ENV[$key] = $value;
        }
    }

    /**
     * Read a value, checking $_ENV then getenv(). Returns $default if unset.
     */
    public static function get(string $key, ?string $default = null): ?string {
        $value = $_ENV[$key] ?? null;
        if ($value === null) {
            $value = getenv($key);
        }
        if ($value === false || $value === '') {
            return $default;
        }
        return $value;
    }
}
