<?php

declare(strict_types=1);

namespace App\Http;

final class Cors
{
    public static function handle(): void
    {
        $allowedOrigin = rtrim(
            $_ENV['FRONTEND_URL'] ?? 'http://localhost:5173',
            '/',
        );

        $requestOrigin = rtrim($_SERVER['HTTP_ORIGIN'] ?? '', '/');

        if ($requestOrigin !== '' && hash_equals($allowedOrigin, $requestOrigin)) {
            header('Access-Control-Allow-Origin: ' . $requestOrigin);
            header('Vary: Origin');
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
        header('Access-Control-Max-Age: 86400');
    }

    private function __construct()
    {
    }
}
