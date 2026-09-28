<?php

declare(strict_types=1);

namespace App\Database;

use PDO;
use PDOException;
use RuntimeException;

final class Connection
{
    private static ?PDO $connection = null;

    public static function get(): PDO
    {
        if (self::$connection instanceof PDO) {
            return self::$connection;
        }

        $host = $_ENV['DB_HOST'] ?? '127.0.0.1';
        $port = $_ENV['DB_PORT'] ?? '3306';
        $database = $_ENV['DB_DATABASE'] ?? '';
        $username = $_ENV['DB_USERNAME'] ?? '';
        $password = $_ENV['DB_PASSWORD'] ?? '';
        $charset = $_ENV['DB_CHARSET'] ?? 'utf8mb4';

        if ($database === '' || $username === '') {
            throw new RuntimeException('Credenciais do banco não configuradas.');
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            $host,
            $port,
            $database,
            $charset,
        );

        try {
            self::$connection = new PDO($dsn, $username, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $exception) {
            throw new RuntimeException(
                'Não foi possível conectar ao banco de dados.',
                0,
                $exception,
            );
        }

        return self::$connection;
    }

    private function __construct()
    {
    }
}
