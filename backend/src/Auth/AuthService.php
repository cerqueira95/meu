<?php

declare(strict_types=1);

namespace App\Auth;

use DateTimeImmutable;
use DomainException;
use PDO;

final class AuthService
{
    public function __construct(
        private readonly PDO $pdo,
    ) {
    }

    public function login(
        string $cpf,
        string $senha,
        ?string $ip,
        ?string $userAgent,
    ): array {
        $cpf = $this->onlyDigits($cpf);

        if (strlen($cpf) !== 11 || $senha === '') {
            throw new DomainException('Informe um CPF válido e sua senha.');
        }

        $usuario = $this->findUserByCpf($cpf);

        if ($usuario === null) {
            $this->logAttempt(null, $cpf, false, 'CPF_NAO_ENCONTRADO', $ip, $userAgent);
            throw new DomainException('CPF ou senha inválidos.');
        }

        if ($usuario['status'] === 'inativo') {
            $this->logAttempt((int) $usuario['id'], $cpf, false, 'USUARIO_INATIVO', $ip, $userAgent);
            throw new DomainException('Seu acesso está inativo. Procure seu responsável.');
        }

        if ($usuario['status'] === 'bloqueado') {
            $this->logAttempt((int) $usuario['id'], $cpf, false, 'USUARIO_BLOQUEADO', $ip, $userAgent);
            throw new DomainException('Seu acesso está bloqueado. Procure seu responsável.');
        }

        if ($this->isTemporarilyBlocked($usuario)) {
            $this->logAttempt((int) $usuario['id'], $cpf, false, 'BLOQUEIO_TEMPORARIO', $ip, $userAgent);
            throw new DomainException('Acesso temporariamente bloqueado. Tente novamente mais tarde.');
        }

        if (!password_verify($senha, (string) $usuario['senha_hash'])) {
            $this->registerFailedAttempt($usuario);
            $this->logAttempt((int) $usuario['id'], $cpf, false, 'SENHA_INCORRETA', $ip, $userAgent);

            throw new DomainException('CPF ou senha inválidos.');
        }

        if (password_needs_rehash((string) $usuario['senha_hash'], PASSWORD_DEFAULT)) {
            $this->rehashPassword((int) $usuario['id'], $senha);
        }

        $this->pdo->prepare(
            'UPDATE usuarios
             SET tentativas_login = 0,
                 bloqueado_ate = NULL,
                 ultimo_login = NOW(),
                 ultimo_ip = :ip
             WHERE id = :id'
        )->execute([
            'ip' => $ip,
            'id' => $usuario['id'],
        ]);

        session_regenerate_id(true);

        $_SESSION['usuario_id'] = (int) $usuario['id'];
        $_SESSION['autenticado_em'] = time();

        $this->logAttempt((int) $usuario['id'], $cpf, true, 'LOGIN_OK', $ip, $userAgent);

        return $this->publicUser($usuario);
    }

    public function currentUser(): ?array
    {
        $usuarioId = $_SESSION['usuario_id'] ?? null;

        if (!is_int($usuarioId) && !ctype_digit((string) $usuarioId)) {
            return null;
        }

        $stmt = $this->pdo->prepare(
            'SELECT id, nome, cpf, matricula, email, cargo, turno, perfil, status, alterar_senha
             FROM usuarios
             WHERE id = :id
             LIMIT 1'
        );

        $stmt->execute([
            'id' => (int) $usuarioId,
        ]);

        $usuario = $stmt->fetch();

        if (!$usuario || $usuario['status'] !== 'ativo') {
            $this->logout();
            return null;
        }

        return $this->publicUser($usuario);
    }

    public function logout(): void
    {
        $_SESSION = [];

        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();

            setcookie(
                session_name(),
                '',
                [
                    'expires' => time() - 42000,
                    'path' => $params['path'] ?? '/',
                    'domain' => $params['domain'] ?? '',
                    'secure' => (bool) ($params['secure'] ?? false),
                    'httponly' => (bool) ($params['httponly'] ?? true),
                    'samesite' => $params['samesite'] ?? 'Lax',
                ],
            );
        }

        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
    }

    private function findUserByCpf(string $cpf): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT *
             FROM usuarios
             WHERE cpf = :cpf
             LIMIT 1'
        );

        $stmt->execute([
            'cpf' => $cpf,
        ]);

        $usuario = $stmt->fetch();

        return $usuario ?: null;
    }

    private function isTemporarilyBlocked(array $usuario): bool
    {
        if (empty($usuario['bloqueado_ate'])) {
            return false;
        }

        $bloqueadoAte = new DateTimeImmutable((string) $usuario['bloqueado_ate']);
        $agora = new DateTimeImmutable();

        if ($bloqueadoAte > $agora) {
            return true;
        }

        $this->pdo->prepare(
            'UPDATE usuarios
             SET tentativas_login = 0,
                 bloqueado_ate = NULL
             WHERE id = :id'
        )->execute([
            'id' => $usuario['id'],
        ]);

        return false;
    }

    private function registerFailedAttempt(array $usuario): void
    {
        $maxTentativas = max(1, $this->configInt('tentativas_login_maximas', 5));
        $tempoBloqueio = max(1, $this->configInt('tempo_bloqueio_minutos', 15));
        $tentativas = ((int) $usuario['tentativas_login']) + 1;

        if ($tentativas >= $maxTentativas) {
            $bloqueadoAte = (new DateTimeImmutable())
                ->modify('+' . $tempoBloqueio . ' minutes')
                ->format('Y-m-d H:i:s');

            $this->pdo->prepare(
                'UPDATE usuarios
                 SET tentativas_login = 0,
                     bloqueado_ate = :bloqueado_ate
                 WHERE id = :id'
            )->execute([
                'bloqueado_ate' => $bloqueadoAte,
                'id' => $usuario['id'],
            ]);

            return;
        }

        $this->pdo->prepare(
            'UPDATE usuarios
             SET tentativas_login = :tentativas
             WHERE id = :id'
        )->execute([
            'tentativas' => $tentativas,
            'id' => $usuario['id'],
        ]);
    }

    private function configInt(string $chave, int $padrao): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT valor
             FROM configuracoes
             WHERE chave = :chave
             LIMIT 1'
        );

        $stmt->execute([
            'chave' => $chave,
        ]);

        $valor = $stmt->fetchColumn();

        if ($valor === false || !is_numeric($valor)) {
            return $padrao;
        }

        return (int) $valor;
    }

    private function logAttempt(
        ?int $usuarioId,
        string $cpf,
        bool $sucesso,
        string $motivo,
        ?string $ip,
        ?string $userAgent,
    ): void {
        $stmt = $this->pdo->prepare(
            'INSERT INTO login_logs (
                usuario_id,
                cpf_informado,
                sucesso,
                motivo,
                ip,
                user_agent
            ) VALUES (
                :usuario_id,
                :cpf,
                :sucesso,
                :motivo,
                :ip,
                :user_agent
            )'
        );

        $stmt->execute([
            'usuario_id' => $usuarioId,
            'cpf' => $cpf,
            'sucesso' => $sucesso ? 1 : 0,
            'motivo' => $motivo,
            'ip' => $ip,
            'user_agent' => $userAgent !== null
                ? substr($userAgent, 0, 500)
                : null,
        ]);
    }

    private function rehashPassword(int $usuarioId, string $senha): void
    {
        $hash = password_hash($senha, PASSWORD_DEFAULT);

        $this->pdo->prepare(
            'UPDATE usuarios
             SET senha_hash = :senha_hash
             WHERE id = :id'
        )->execute([
            'senha_hash' => $hash,
            'id' => $usuarioId,
        ]);
    }

    private function publicUser(array $usuario): array
    {
        return [
            'id' => (int) $usuario['id'],
            'nome' => (string) $usuario['nome'],
            'cpf' => $this->maskCpf((string) $usuario['cpf']),
            'matricula' => $usuario['matricula'] ?? null,
            'email' => $usuario['email'] ?? null,
            'cargo' => $usuario['cargo'] ?? null,
            'turno' => $usuario['turno'] ?? null,
            'perfil' => (string) ($usuario['perfil'] ?? 'usuario'),
            'alterar_senha' => (bool) ($usuario['alterar_senha'] ?? false),
        ];
    }

    private function onlyDigits(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?? '';
    }

    private function maskCpf(string $cpf): string
    {
        if (strlen($cpf) !== 11) {
            return $cpf;
        }

        return substr($cpf, 0, 3)
            . '.***.***-'
            . substr($cpf, -2);
    }
}
