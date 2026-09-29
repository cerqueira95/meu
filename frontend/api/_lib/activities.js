import { sql } from './db.js'

export const FIVE_S_OPTIONS = [
  ['rua-a', 'Rua A'],
  ['rua-l', 'Rua L'],
  ['rua-j', 'Rua J'],
  ['rua-i', 'Rua I'],
  ['rua-h', 'Rua H'],
  ['rua-e', 'Rua E'],
  ['rua-c', 'Rua C'],
  ['rua-f', 'Rua F'],
  ['rua-d', 'Rua D'],
  ['rua-k', 'Rua K'],
  ['picking-pre-picking', 'Picking - Pré-picking'],
  ['picking-rua-1', 'Picking - Rua 1'],
  ['picking-rua-2', 'Picking - Rua 2'],
  ['picking-rua-3', 'Picking - Rua 3'],
  ['picking-rua-4', 'Picking - Rua 4'],
  ['picking-rua-5', 'Picking - Rua 5'],
  ['picking-rgb', 'Picking - RGB'],
  ['molho-ag', 'Molho AG'],
  ['empurrada', 'Empurrada'],
  ['selo-vermelho', 'Selo Vermelho'],
  ['selo-verde', 'Selo Verde'],
  ['selo-vermelho-2', 'Selo Vermelho 2'],
  ['camara-chopp', 'Camara de Chopp'],
  ['estacionamento-paleteiras', 'Estacionamento das paleteiras'],
  ['estacionamento-empilhadeiras', 'Estacionamento das empilhadeiras'],
  ['repack', 'Repack'],
  ['pzc', 'PZC'],
  ['devolucao', 'Devolução'],
  ['refugo', 'Refugo'],
  ['troca', 'Troca'],
  ['qg-empurrada', 'QG Empurrada'],
  ['qg-carregamento', 'QG Carregamento'],
  ['market-place', 'Market Place'],
  ['tenda', 'Tenda'],
  ['area-paletes', 'Area de Paletes (Bons / Quebrados)'],
  ['pit-stop', 'Pit Stop'],
  ['sala-manutencao', 'Sala de Manutenção'],
  ['faixa-pedestre', 'Faixa de Pedestre'],
  ['sala-paleteiras', 'Sala das Paleteiras'],
  ['outra', 'Outra'],
]

let schemaPromise

export function currentBahiaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bahia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function ensureActivitiesSchema() {
  if (!schemaPromise) {
    schemaPromise = createSchema().catch((error) => {
      schemaPromise = null
      throw error
    })
  }
  return schemaPromise
}

async function createSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS atividade_catalogo (
      id BIGSERIAL PRIMARY KEY,
      chave VARCHAR(80) NOT NULL UNIQUE,
      nome VARCHAR(160) NOT NULL,
      valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    INSERT INTO atividade_catalogo (chave, nome, valor_unitario, ativo)
    VALUES
      ('5s', '5S', 1.00, TRUE),
      ('amarracao', 'Amarração', 5.00, TRUE)
    ON CONFLICT (chave) DO NOTHING
  `

  await sql`
    CREATE TABLE IF NOT EXISTS atividade_lancamentos (
      id BIGSERIAL PRIMARY KEY,
      atividade_chave VARCHAR(50) NOT NULL,
      atividade_nome VARCHAR(120) NOT NULL,
      data_atividade DATE NOT NULL,
      usuario_criador_id BIGINT NOT NULL,
      usuario_criador_nome VARCHAR(180) NOT NULL,
      valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
      observacao TEXT,
      detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'pendente',
      motivo_reprovacao TEXT,
      aprovado_por_id BIGINT,
      aprovado_por_nome VARCHAR(180),
      aprovado_em TIMESTAMPTZ,
      reprovado_por_id BIGINT,
      reprovado_por_nome VARCHAR(180),
      reprovado_em TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS atividade_lancamento_participantes (
      id BIGSERIAL PRIMARY KEY,
      lancamento_id BIGINT NOT NULL REFERENCES atividade_lancamentos(id) ON DELETE CASCADE,
      usuario_id BIGINT NOT NULL,
      usuario_nome VARCHAR(180) NOT NULL,
      usuario_cpf VARCHAR(20),
      usuario_turno VARCHAR(80),
      papel VARCHAR(20) NOT NULL DEFAULT 'ajudante',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (lancamento_id, usuario_id)
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS atividade_lancamento_itens (
      id BIGSERIAL PRIMARY KEY,
      lancamento_id BIGINT NOT NULL REFERENCES atividade_lancamentos(id) ON DELETE CASCADE,
      opcao_chave VARCHAR(120) NOT NULL,
      opcao_nome VARCHAR(180) NOT NULL,
      valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
      evidencia_foto TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (lancamento_id, opcao_chave)
    )
  `

  await sql`
    ALTER TABLE atividade_lancamentos
    ADD COLUMN IF NOT EXISTS detalhes JSONB NOT NULL DEFAULT '{}'::jsonb
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_atividade_lancamentos_status
    ON atividade_lancamentos(status, data_atividade DESC)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_atividade_participantes_usuario
    ON atividade_lancamento_participantes(usuario_id, lancamento_id)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_atividade_itens_opcao
    ON atividade_lancamento_itens(opcao_chave, lancamento_id)
  `

  await sql`
    CREATE TABLE IF NOT EXISTS atividade_notificacoes (
      id BIGSERIAL PRIMARY KEY,
      usuario_id BIGINT NOT NULL,
      lancamento_id BIGINT NOT NULL REFERENCES atividade_lancamentos(id) ON DELETE CASCADE,
      tipo VARCHAR(30) NOT NULL,
      titulo VARCHAR(180) NOT NULL,
      mensagem TEXT NOT NULL,
      lida_em TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_atividade_notificacoes_usuario
    ON atividade_notificacoes(usuario_id, lida_em, criado_em DESC)
  `
}

export function serializeActivityBatch(row, participants = [], items = []) {
  const unitValue = Number(row.valor_unitario || 0)
  const individualTotal = items.length * unitValue

  return {
    id: Number(row.id),
    atividade_chave: row.atividade_chave,
    atividade_nome: row.atividade_nome,
    data_atividade: row.data_atividade,
    usuario_criador_id: Number(row.usuario_criador_id),
    usuario_criador_nome: row.usuario_criador_nome,
    valor_unitario: unitValue,
    observacao: row.observacao || '',
    detalhes: row.detalhes || {},
    status: row.status,
    motivo_reprovacao: row.motivo_reprovacao || '',
    aprovado_por_nome: row.aprovado_por_nome || null,
    aprovado_em: row.aprovado_em || null,
    reprovado_por_nome: row.reprovado_por_nome || null,
    reprovado_em: row.reprovado_em || null,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    participantes: participants.map((participant) => ({
      id: Number(participant.id),
      usuario_id: Number(participant.usuario_id),
      usuario_nome: participant.usuario_nome,
      usuario_cpf: participant.usuario_cpf || null,
      usuario_turno: participant.usuario_turno || null,
      papel: participant.papel,
    })),
    itens: items.map((item) => ({
      id: Number(item.id),
      opcao_chave: item.opcao_chave,
      opcao_nome: item.opcao_nome,
      valor_unitario: Number(item.valor_unitario || 0),
      evidencia_foto: item.evidencia_foto || null,
    })),
    quantidade_areas: items.length,
    quantidade_participantes: participants.length,
    valor_individual: individualTotal,
    valor_grupo: individualTotal * participants.length,
  }
}

export async function loadActivityBatch(id) {
  const rows = await sql`
    SELECT *
    FROM atividade_lancamentos
    WHERE id = ${id}
    LIMIT 1
  `

  const batch = rows[0]
  if (!batch) return null

  const [participants, items] = await Promise.all([
    sql`
      SELECT *
      FROM atividade_lancamento_participantes
      WHERE lancamento_id = ${id}
      ORDER BY CASE WHEN papel = 'principal' THEN 0 ELSE 1 END, usuario_nome
    `,
    sql`
      SELECT *
      FROM atividade_lancamento_itens
      WHERE lancamento_id = ${id}
      ORDER BY id
    `,
  ])

  return serializeActivityBatch(batch, participants, items)
}

export function optionMap5s() {
  return new Map(FIVE_S_OPTIONS)
}

export function validImageData(value) {
  const image = String(value || '')
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image) && image.length <= 900_000
}


export async function getActivityConfig(chave) {
  await ensureActivitiesSchema()

  const rows = await sql`
    SELECT id, chave, nome, valor_unitario, ativo, atualizado_em
    FROM atividade_catalogo
    WHERE chave = ${chave}
    LIMIT 1
  `

  const row = rows[0]
  if (!row) return null

  return {
    id: Number(row.id),
    chave: row.chave,
    nome: row.nome,
    valor_unitario: Number(row.valor_unitario || 0),
    ativo: Boolean(row.ativo),
    atualizado_em: row.atualizado_em,
  }
}

export async function listActivityConfigs() {
  await ensureActivitiesSchema()

  const rows = await sql`
    SELECT id, chave, nome, valor_unitario, ativo, atualizado_em
    FROM atividade_catalogo
    ORDER BY nome
  `

  return rows.map((row) => ({
    id: Number(row.id),
    chave: row.chave,
    nome: row.nome,
    valor_unitario: Number(row.valor_unitario || 0),
    ativo: Boolean(row.ativo),
    atualizado_em: row.atualizado_em,
  }))
}
