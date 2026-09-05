<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/env.php';

// Ensure environment is loaded regardless of entrypoint (api.php, tests, migrations).
Env::load(dirname(__DIR__, 3));

/**
 * PDO Database Connection Factory
 *
 * Manages singleton PDO connection instance with error handling, utf8mb4 encoding,
 * and parameterized query enforcement.
 *
 * @package PemboEHub\Config
 */
class Database {
    /** @var PDO|null Cached PDO connection instance */
    private static ?PDO $instance = null;

    /**
     * Get singleton PDO connection to configured application database.
     *
     * @return PDO Initialized PDO instance.
     * @throws RuntimeException If database connection fails or env credentials are missing.
     */
    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $host   = Env::get('DB_HOST');
            $port   = Env::get('DB_PORT', '3306');
            $dbname = Env::get('DB_NAME');
            $user   = Env::get('DB_USER');
            $pass   = Env::get('DB_PASS', '');

            if ($host === null || $dbname === null || $user === null) {
                error_log("Database configuration missing (DB_HOST/DB_NAME/DB_USER).");
                throw new RuntimeException("Service temporarily unavailable. Database is not configured.");
            }

            $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";
            
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];
            
            try {
                self::$instance = new PDO($dsn, $user, $pass, $options);
            } catch (PDOException $e) {
                error_log("Database connection failure: " . $e->getMessage());
                throw new RuntimeException("Service temporarily unavailable. Unable to connect to database.");
            }
        }
        
        return self::$instance;
    }

    /**
     * Get standalone PDO connection without selecting a database (used in setup scripts & test harness database creation).
     *
     * @return PDO Root server PDO connection instance.
     * @throws RuntimeException If database connection fails or env credentials are missing.
     */
    public static function getRootConnectionWithoutDb(): PDO {
        $host = Env::get('DB_HOST');
        $port = Env::get('DB_PORT', '3306');
        $user = Env::get('DB_USER');
        $pass = Env::get('DB_PASS', '');

        if ($host === null || $user === null) {
            throw new RuntimeException("Database configuration missing (DB_HOST/DB_USER).");
        }
        
        $dsn = "mysql:host={$host};port={$port};charset=utf8mb4";
        return new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
}

