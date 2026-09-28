USE `arztec86_gabriel`;

CREATE TABLE IF NOT EXISTS `usuarios` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(150) NOT NULL,
    `cpf` CHAR(11) NOT NULL,
    `matricula` VARCHAR(50) DEFAULT NULL,
    `email` VARCHAR(190) DEFAULT NULL,
    `senha_hash` VARCHAR(255) NOT NULL,
    `cargo` VARCHAR(100) DEFAULT NULL,
    `turno` VARCHAR(50) DEFAULT NULL,
    `perfil` VARCHAR(50) NOT NULL DEFAULT 'usuario',
    `status` ENUM('ativo', 'inativo', 'bloqueado') NOT NULL DEFAULT 'ativo',
    `alterar_senha` TINYINT(1) NOT NULL DEFAULT 0,
    `tentativas_login` INT UNSIGNED NOT NULL DEFAULT 0,
    `bloqueado_ate` DATETIME DEFAULT NULL,
    `ultimo_login` DATETIME DEFAULT NULL,
    `ultimo_ip` VARCHAR(45) DEFAULT NULL,
    `criado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `atualizado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_usuarios_cpf` (`cpf`),
    UNIQUE KEY `uq_usuarios_matricula` (`matricula`),
    UNIQUE KEY `uq_usuarios_email` (`email`),
    KEY `idx_usuarios_nome` (`nome`),
    KEY `idx_usuarios_status` (`status`),
    KEY `idx_usuarios_perfil` (`perfil`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `login_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `usuario_id` BIGINT UNSIGNED DEFAULT NULL,
    `cpf_informado` CHAR(11) DEFAULT NULL,
    `sucesso` TINYINT(1) NOT NULL DEFAULT 0,
    `motivo` VARCHAR(100) DEFAULT NULL,
    `ip` VARCHAR(45) DEFAULT NULL,
    `user_agent` VARCHAR(500) DEFAULT NULL,
    `criado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_login_usuario` (`usuario_id`),
    KEY `idx_login_cpf` (`cpf_informado`),
    KEY `idx_login_data` (`criado_em`),
    KEY `idx_login_sucesso` (`sucesso`),
    CONSTRAINT `fk_login_logs_usuario`
        FOREIGN KEY (`usuario_id`)
        REFERENCES `usuarios` (`id`)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `configuracoes` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `chave` VARCHAR(100) NOT NULL,
    `valor` TEXT DEFAULT NULL,
    `descricao` VARCHAR(255) DEFAULT NULL,
    `atualizado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_configuracoes_chave` (`chave`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

INSERT INTO `configuracoes` (`chave`, `valor`, `descricao`)
VALUES
    ('nome_sistema', 'Sistema de Armazém', 'Nome apresentado na aplicação'),
    ('tentativas_login_maximas', '5', 'Quantidade de tentativas antes do bloqueio temporário'),
    ('tempo_bloqueio_minutos', '15', 'Tempo de bloqueio depois de exceder as tentativas')
ON DUPLICATE KEY UPDATE
    `descricao` = VALUES(`descricao`);
