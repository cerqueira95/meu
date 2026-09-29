import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS wms_usuario_id VARCHAR(64)`
await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS wms_login VARCHAR(190)`
await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS origem VARCHAR(30) NOT NULL DEFAULT 'local'`

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_wms_usuario_id
  ON usuarios (wms_usuario_id)
  WHERE wms_usuario_id IS NOT NULL
`

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_wms_login
  ON usuarios (wms_login)
  WHERE wms_login IS NOT NULL
`

await sql`
  CREATE TABLE IF NOT EXISTS wms_item_coletas (
    id BIGSERIAL PRIMARY KEY,
    data_ref DATE NOT NULL UNIQUE,
    coletado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_registros INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ok',
    erro VARCHAR(255),
    fonte TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`

await sql`
  CREATE TABLE IF NOT EXISTS wms_item_registros (
    id BIGSERIAL PRIMARY KEY,
    coleta_id BIGINT NOT NULL REFERENCES wms_item_coletas(id) ON DELETE CASCADE,
    data_ref DATE NOT NULL,
    mapa VARCHAR(80),
    palete VARCHAR(120),
    entrega VARCHAR(40),
    caixa VARCHAR(120),
    area_separacao VARCHAR(190),
    codigo_item VARCHAR(80),
    item_descricao VARCHAR(500),
    quantidade NUMERIC(14,3),
    origem VARCHAR(120),
    equipamento VARCHAR(120),
    inicio_texto VARCHAR(40),
    fim_texto VARCHAR(40),
    duracao_seg NUMERIC(14,3),
    usuario_login VARCHAR(190),
    usuario_nome VARCHAR(255),
    coletado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`

await sql`ALTER TABLE wms_item_registros ADD COLUMN IF NOT EXISTS data_entrega DATE`

await sql`
  UPDATE wms_item_registros
  SET data_entrega = TO_DATE(SPLIT_PART(entrega, ' ', 1), 'DD/MM/YYYY')
  WHERE data_entrega IS NULL
    AND entrega ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
`

await sql`
  CREATE INDEX IF NOT EXISTS idx_wms_item_data
  ON wms_item_registros (data_ref DESC)
`

await sql`
  CREATE INDEX IF NOT EXISTS idx_wms_item_data_entrega
  ON wms_item_registros (data_entrega DESC)
`

await sql`
  CREATE INDEX IF NOT EXISTS idx_wms_item_usuario
  ON wms_item_registros (usuario_login, data_ref DESC)
`

await sql`
  CREATE INDEX IF NOT EXISTS idx_wms_item_pickpack
  ON wms_item_registros (data_ref, area_separacao, usuario_nome)
`

await sql`
  CREATE TABLE IF NOT EXISTS escalonada_resultados (
    id BIGSERIAL PRIMARY KEY,
    data_ref DATE NOT NULL,
    usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
    wms_usuario_id VARCHAR(64) NOT NULL,
    wms_login VARCHAR(190),
    usuario_nome VARCHAR(255) NOT NULL,
    pontuacao NUMERIC(14,2) NOT NULL DEFAULT 0,
    valor_base NUMERIC(14,2) NOT NULL DEFAULT 0,
    pickpack BOOLEAN NOT NULL DEFAULT FALSE,
    pickpack_area VARCHAR(190),
    pickpack_qtd INTEGER NOT NULL DEFAULT 0,
    percentual NUMERIC(6,2) NOT NULL DEFAULT 0,
    incentivo NUMERIC(14,2) NOT NULL DEFAULT 0,
    valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (data_ref, wms_usuario_id)
  )
`

await sql`
  CREATE INDEX IF NOT EXISTS idx_escalonada_usuario_data
  ON escalonada_resultados (usuario_id, data_ref DESC)
`

await sql`
  CREATE TABLE IF NOT EXISTS escalonada_notificacoes (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
    resultado_id BIGINT NOT NULL UNIQUE REFERENCES escalonada_resultados(id) ON DELETE CASCADE,
    titulo VARCHAR(180) NOT NULL,
    mensagem VARCHAR(500) NOT NULL,
    lida_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`

await sql`
  CREATE INDEX IF NOT EXISTS idx_escalonada_notificacoes_usuario
  ON escalonada_notificacoes (usuario_id, lida_em, criado_em DESC)
`

console.log('Migração da escalonada concluída.')
