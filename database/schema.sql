-- PostgreSQL / Neon
-- Projeto Warehouse

CREATE TABLE IF NOT EXISTS usuarios (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    cpf CHAR(11) NOT NULL UNIQUE,
    matricula VARCHAR(50) UNIQUE,
    email VARCHAR(190) UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    cargo VARCHAR(100),
    turno VARCHAR(50),
    perfil VARCHAR(50) NOT NULL DEFAULT 'usuario',
    status VARCHAR(20) NOT NULL DEFAULT 'ativo'
        CHECK (status IN ('ativo', 'inativo', 'bloqueado')),
    alterar_senha BOOLEAN NOT NULL DEFAULT FALSE,
    tentativas_login INTEGER NOT NULL DEFAULT 0,
    bloqueado_ate TIMESTAMPTZ,
    ultimo_login TIMESTAMPTZ,
    ultimo_ip VARCHAR(45),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_nome ON usuarios (nome);
CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios (status);
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON usuarios (perfil);

CREATE TABLE IF NOT EXISTS login_logs (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT REFERENCES usuarios(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    cpf_informado CHAR(11),
    sucesso BOOLEAN NOT NULL DEFAULT FALSE,
    motivo VARCHAR(100),
    ip VARCHAR(45),
    user_agent VARCHAR(500),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_usuario ON login_logs (usuario_id);
CREATE INDEX IF NOT EXISTS idx_login_cpf ON login_logs (cpf_informado);
CREATE INDEX IF NOT EXISTS idx_login_data ON login_logs (criado_em);
CREATE INDEX IF NOT EXISTS idx_login_sucesso ON login_logs (sucesso);

CREATE TABLE IF NOT EXISTS configuracoes (
    id BIGSERIAL PRIMARY KEY,
    chave VARCHAR(100) NOT NULL UNIQUE,
    valor TEXT,
    descricao VARCHAR(255),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessoes (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    ip VARCHAR(45),
    user_agent VARCHAR(500),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultimo_uso_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expira_em TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes (expira_em);

INSERT INTO configuracoes (chave, valor, descricao)
VALUES
    ('nome_sistema', 'Sistema de Armazém', 'Nome apresentado na aplicação'),
    ('tentativas_login_maximas', '5', 'Quantidade de tentativas antes do bloqueio temporário'),
    ('tempo_bloqueio_minutos', '15', 'Tempo de bloqueio depois de exceder as tentativas')
ON CONFLICT (chave)
DO UPDATE SET descricao = EXCLUDED.descricao;

INSERT INTO usuarios (
    nome,
    cpf,
    matricula,
    email,
    senha_hash,
    cargo,
    turno,
    perfil,
    status,
    alterar_senha
)
VALUES (
    'Gabriel',
    '06297596506',
    NULL,
    NULL,
    '$2b$12$st1UvASRemksVDjLSM2GR.rBc0r3dD4rH3ATYTpW4ETspyGOMdV1q',
    'Supervisor',
    NULL,
    'ADM',
    'ativo',
    FALSE
)
ON CONFLICT (cpf)
DO UPDATE SET
    nome = EXCLUDED.nome,
    senha_hash = EXCLUDED.senha_hash,
    cargo = EXCLUDED.cargo,
    perfil = EXCLUDED.perfil,
    status = EXCLUDED.status;


CREATE TABLE IF NOT EXISTS acessos_rapidos (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    user_agent VARCHAR(500),
    ip VARCHAR(45),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultimo_uso_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expira_em TIMESTAMPTZ NOT NULL,
    revogado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_acessos_rapidos_usuario
    ON acessos_rapidos (usuario_id);

CREATE INDEX IF NOT EXISTS idx_acessos_rapidos_expira
    ON acessos_rapidos (expira_em);


CREATE TABLE IF NOT EXISTS armazem_publicacoes (
    id BIGSERIAL PRIMARY KEY,
    autor_id BIGINT NOT NULL REFERENCES usuarios(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    titulo VARCHAR(180) NOT NULL,
    conteudo TEXT NOT NULL,
    imagem_data TEXT,
    imagens_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_armazem_publicacoes_data
    ON armazem_publicacoes (criado_em DESC);

CREATE TABLE IF NOT EXISTS armazem_comentarios (
    id BIGSERIAL PRIMARY KEY,
    publicacao_id BIGINT NOT NULL REFERENCES armazem_publicacoes(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    texto VARCHAR(1000) NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_armazem_comentarios_publicacao
    ON armazem_comentarios (publicacao_id, criado_em);

CREATE TABLE IF NOT EXISTS armazem_reacoes (
    id BIGSERIAL PRIMARY KEY,
    publicacao_id BIGINT NOT NULL REFERENCES armazem_publicacoes(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    tipo VARCHAR(20) NOT NULL
        CHECK (tipo IN ('curtir', 'parabens', 'importante')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (publicacao_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_armazem_reacoes_publicacao
    ON armazem_reacoes (publicacao_id);


UPDATE armazem_publicacoes
SET imagens_data = jsonb_build_array(imagem_data)
WHERE imagem_data IS NOT NULL
  AND imagem_data <> ''
  AND jsonb_array_length(imagens_data) = 0;
