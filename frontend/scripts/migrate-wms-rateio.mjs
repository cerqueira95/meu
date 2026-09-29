import { neon } from '@neondatabase/serverless'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL ausente')
}

const sql = neon(connectionString)

await sql`
  CREATE TABLE IF NOT EXISTS wms_rateio_coletas (
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
  CREATE TABLE IF NOT EXISTS wms_rateio_registros (
    id BIGSERIAL PRIMARY KEY,
    coleta_id BIGINT NOT NULL REFERENCES wms_rateio_coletas(id) ON DELETE CASCADE,
    data_ref DATE NOT NULL,
    wms_usuario_id VARCHAR(64) NOT NULL,
    usuario_nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(120),
    creditos NUMERIC(14,2) NOT NULL DEFAULT 0,
    debitos NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    valor NUMERIC(14,2) NOT NULL DEFAULT 0,
    coletado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (data_ref, wms_usuario_id, tipo)
  )
`

await sql`
  CREATE INDEX IF NOT EXISTS idx_wms_rateio_registros_data
  ON wms_rateio_registros (data_ref DESC)
`

await sql`
  CREATE INDEX IF NOT EXISTS idx_wms_rateio_registros_usuario
  ON wms_rateio_registros (wms_usuario_id, data_ref DESC)
`

console.log('WMS rateio schema ready')
