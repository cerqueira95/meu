<?php

declare(strict_types=1);

use App\Auth\AuthService;
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

$secureCookie = filter_var(
    $_ENV['SESSION_SECURE'] ?? ($_ENV['APP_ENV'] ?? 'local') === 'production',
    FILTER_VALIDATE_BOOL,
);

$sessionDomain = trim($_ENV['SESSION_DOMAIN'] ?? '');
$sessionSameSite = $_ENV['SESSION_SAMESITE'] ?? 'Lax';

session_name($_ENV['SESSION_NAME'] ?? 'warehouse_session');

$cookieParams = [
    'lifetime' => 0,
    'path' => '/',
    'secure' => $secureCookie,
    'httponly' => true,
    'samesite' => $sessionSameSite,
];

if ($sessionDomain !== '') {
    $cookieParams['domain'] = $sessionDomain;
}

session_set_cookie_params($cookieParams);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = '/' . trim($path, '/');

function jsonBody(): array
{
    $raw = file_get_contents('php://input');

    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);

    return is_array($data) ? $data : [];
}

try {
    $auth = new AuthService(Connection::get());

    if ($method === 'GET' && $path === '/api/health') {
        Connection::get()->query('SELECT 1');

        Response::json([
            'status' => 'ok',
            'message' => 'API PHP funcionando.',
            'database' => 'connected',
            'timestamp' => date(DATE_ATOM),
        ]);
    }

    if ($method === 'POST' && $path === '/api/auth/login') {
        $payload = jsonBody();

        $usuario = $auth->login(
            (string) ($payload['cpf'] ?? ''),
            (string) ($payload['senha'] ?? ''),
            $_SERVER['REMOTE_ADDR'] ?? null,
            $_SERVER['HTTP_USER_AGENT'] ?? null,
        );

        Response::json([
            'status' => 'ok',
            'message' => 'Login realizado com sucesso.',
            'usuario' => $usuario,
        ]);
    }

    if ($method === 'GET' && $path === '/api/auth/me') {
        $usuario = $auth->currentUser();

        if ($usuario === null) {
            Response::json([
                'status' => 'error',
                'message' => 'Sessão não autenticada.',
            ], 401);
        }

        Response::json([
            'status' => 'ok',
            'usuario' => $usuario,
        ]);
    }

    if ($method === 'POST' && $path === '/api/auth/logout') {
        $auth->logout();

        Response::json([
            'status' => 'ok',
            'message' => 'Sessão encerrada.',
        ]);
    }

    Response::json([
        'status' => 'error',
        'message' => 'Rota não encontrada.',
    ], 404);
} catch (DomainException $exception) {
    Response::json([
        'status' => 'error',
        'message' => $exception->getMessage(),
    ], 401);
} catch (Throwable $exception) {
    $debug = filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOL);

    Response::json([
        'status' => 'error',
        'message' => $debug
            ? $exception->getMessage()
            : 'Erro interno do servidor.',
    ], 500);
}
