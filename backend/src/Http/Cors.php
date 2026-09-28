<?php

declare(strict_types=1);

namespace App\Http;

final class Cors
{
    public static function handle(): void
    {
        $allowedOrigins = array_values(array_filter(array_map(
            static fn (string $origin): string => rtrim(trim($origin), '/'),
            explode(',', $_ENV['FRONTEND_URL'] ?? 'http://localhost:5173'),
        )));

        $requestOrigin = rtrim($_SERVER['HTTP_ORIGIN'] ?? '', '/');

        if ($requestOrigin !== '' && in_array($requestOrigin, $allowedOrigins, true)) {
            header('Access-Control-Allow-Origin: ' . $requestOrigin);
            header('Access-Control-Allow-Credentials: true');
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
