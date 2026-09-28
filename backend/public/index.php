<?php

declare(strict_types=1);

use App\Database\Connection;
use App\Http\Cors;
use App\Http\Response;

require dirname(__DIR__) . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(dirname(__DIR__));
$dotenv->safeLoad();

Cors::handle();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = '/' . trim($path, '/');

try {
    if ($method === 'GET' && $path === '/api/health') {
        $database = 'not_checked';

        try {
            Connection::get()->query('SELECT 1');
            $database = 'connected';
        } catch (Throwable) {
            $database = 'unavailable';
        }

        Response::json([
            'status' => 'ok',
            'message' => 'API PHP funcionando.',
            'database' => $database,
            'timestamp' => date(DATE_ATOM),
        ]);
    }

    Response::json([
        'status' => 'error',
        'message' => 'Rota não encontrada.',
    ], 404);
} catch (Throwable $exception) {
    $debug = filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOL);

    Response::json([
        'status' => 'error',
        'message' => $debug
            ? $exception->getMessage()
            : 'Erro interno do servidor.',
    ], 500);
}
