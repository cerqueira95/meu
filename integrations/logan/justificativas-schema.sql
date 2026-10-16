-- Carta Controle TMA: tabela de justificativas e trilha de auditoria.
-- Criar somente tabelas novas; não modificar as tabelas WMS.
CREATE TABLE IF NOT EXISTS logan_tma_justificativas (
  id BIGSERIAL PRIMARY KEY,
  documento_de_transporte TEXT NOT NULL UNIQUE,
  justificativa TEXT NOT NULL CHECK (char_length(justificativa) BETWEEN 5 AND 3000),
  usuario_id TEXT,
  usuario_nome TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logan_tma_justificativas_historico (
  id BIGSERIAL PRIMARY KEY,
  justificativa_id BIGINT NOT NULL REFERENCES logan_tma_justificativas(id),
  documento_de_transporte TEXT NOT NULL,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('CRIACAO', 'EDICAO')),
  justificativa_anterior TEXT,
  justificativa TEXT NOT NULL,
  usuario_id TEXT,
  usuario_nome TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logan_tma_justificativas_historico_doc
  ON logan_tma_justificativas_historico (documento_de_transporte, id DESC);
