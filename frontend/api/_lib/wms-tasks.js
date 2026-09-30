import crypto from 'node:crypto'
import { sql } from './db.js'

const DEFAULT_TASK_VALUES = [
  ['Carregamento Palete Misto (Rota)', 0.20],
  ['Carregamento Palete Fechado (Rota)', 0.10],
  ['Carregamento Palete Misto (AS)', 0.20],
  ['Carregamento Palete Fechado (AS)', 0.10],
  ['Retorno de Rota (Descarregamento)', 0.10],
  ['Armazenagem (Mapa)', 0.10],
  ['Carregamento AG', 0.06],
  ['Descarregamento', 0.10],
  ['Puxada Giro 360', 0.10],
  ['Ressuprimento Manual', 0.10],
  ['Movimentação Interna - Manual', 0.10],
  ['Carregamento Palete Fechado Rota - Novo', 0.10],
  ['Carregamento Palete Misto Rota - Novo', 0.20],
  ['Carregamento Palete Misto AS - Novo', 0.20],
  ['Carregamento Palete Fechado AS - Novo', 0.10],
  ['Carregamento AG - Novo', 0.06],
]

export function normalizeWmsTaskKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

let wmsTaskSchemaPromise = null

export function ensureWmsTaskSchema() {
  if (!wmsTaskSchemaPromise) {
    wmsTaskSchemaPromise = createWmsTaskSchema().catch((error) => {
      wmsTaskSchemaPromise = null
      throw error
    })
  }
  return wmsTaskSchemaPromise
}

async function createWmsTaskSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS wms_tarefa_valores (
      chave VARCHAR(220) PRIMARY KEY,
      nome VARCHAR(220) NOT NULL,
      valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS wms_tarefas_registros (
      id BIGSERIAL PRIMARY KEY,
      wms_task_id VARCHAR(160) NOT NULL UNIQUE,
      data_ref DATE NOT NULL,
      documento VARCHAR(120),
      origem VARCHAR(180),
      destino VARCHAR(180),
      palete VARCHAR(180),
      status VARCHAR(100),
      status_id INTEGER,
      tipo_nome VARCHAR(220) NOT NULL,
      tipo_chave VARCHAR(220) NOT NULL,
      usuario_nome_wms VARCHAR(220),
      usuario_id BIGINT,
      data_criacao TEXT,
      data_associacao TEXT,
      data_liberacao TEXT,
      data_alteracao TEXT,
      placa_cavalo VARCHAR(80),
      placa_carreta VARCHAR(80),
      tarefa VARCHAR(120),
      prioridade VARCHAR(80),
      valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
      importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_wms_tarefas_usuario_data
    ON wms_tarefas_registros(usuario_id, data_ref)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_wms_tarefas_tipo_data
    ON wms_tarefas_registros(tipo_chave, data_ref)
  `

  await sql`
    CREATE TABLE IF NOT EXISTS wms_tarefa_coletas (
      data_ref DATE PRIMARY KEY,
      status VARCHAR(20) NOT NULL,
      source TEXT,
      total_recebido INTEGER NOT NULL DEFAULT 0,
      total_completo INTEGER NOT NULL DEFAULT 0,
      total_vinculado INTEGER NOT NULL DEFAULT 0,
      total_sem_usuario INTEGER NOT NULL DEFAULT 0,
      total_sem_valor INTEGER NOT NULL DEFAULT 0,
      mensagem TEXT,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  for (const [nome, valor] of DEFAULT_TASK_VALUES) {
    const chave = normalizeWmsTaskKey(nome)
    await sql`
      INSERT INTO wms_tarefa_valores (
        chave,
        nome,
        valor_unitario,
        ativo,
        atualizado_em
      )
      VALUES (
        ${chave},
        ${nome},
        ${valor},
        TRUE,
        NOW()
      )
      ON CONFLICT (chave) DO NOTHING
    `
  }
}

export async function listWmsTaskConfigs() {
  await ensureWmsTaskSchema()

  const rows = await sql`
    SELECT chave, nome, valor_unitario, ativo, atualizado_em
    FROM wms_tarefa_valores
    ORDER BY nome
  `

  return rows.map((row) => ({
    chave: row.chave,
    nome: row.nome,
    valor_unitario: Number(row.valor_unitario || 0),
    ativo: Boolean(row.ativo),
    atualizado_em: row.atualizado_em,
  }))
}

export async function updateWmsTaskValue({ chave, valor }) {
  await ensureWmsTaskSchema()

  const rows = await sql`
    UPDATE wms_tarefa_valores
    SET valor_unitario = ${valor},
        atualizado_em = NOW()
    WHERE chave = ${normalizeWmsTaskKey(chave)}
    RETURNING chave, nome, valor_unitario, ativo, atualizado_em
  `

  if (!rows[0]) return null

  return {
    chave: rows[0].chave,
    nome: rows[0].nome,
    valor_unitario: Number(rows[0].valor_unitario || 0),
    ativo: Boolean(rows[0].ativo),
    atualizado_em: rows[0].atualizado_em,
  }
}

export async function saveWmsTaskCollection({ date, source, rows }) {
  await ensureWmsTaskSchema()

  const allRows = Array.isArray(rows) ? rows : []
  const completedRows = allRows.filter(isCompletedTask)

  const taskTypes = new Map()
  for (const row of completedRows) {
    const nome = textOrNull(row.workType)
    const chave = normalizeWmsTaskKey(nome)
    if (nome && chave && !taskTypes.has(chave)) {
      taskTypes.set(chave, nome)
    }
  }

  for (const [chave, nome] of taskTypes) {
    await sql`
      INSERT INTO wms_tarefa_valores (
        chave,
        nome,
        valor_unitario,
        ativo,
        atualizado_em
      )
      VALUES (
        ${chave},
        ${nome},
        0,
        TRUE,
        NOW()
      )
      ON CONFLICT (chave)
      DO UPDATE SET nome = EXCLUDED.nome
    `
  }

  const [users, configs] = await Promise.all([
    sql`
      SELECT id, nome
      FROM usuarios
      WHERE status = 'ativo'
        AND UPPER(TRIM(COALESCE(cargo, ''))) = 'EMPILHADEIRA'
      ORDER BY nome
    `,
    sql`
      SELECT chave, nome, valor_unitario, ativo
      FROM wms_tarefa_valores
    `,
  ])

  const usersByName = new Map()
  for (const user of users) {
    const key = normalizeWmsTaskKey(user.nome)
    if (!key) continue
    const current = usersByName.get(key) || []
    current.push(user)
    usersByName.set(key, current)
  }

  const configByKey = new Map(
    configs.map((item) => [
      normalizeWmsTaskKey(item.chave),
      {
        ...item,
        valor_unitario: Number(item.valor_unitario || 0),
        ativo: Boolean(item.ativo),
      },
    ]),
  )

  let linked = 0
  let withoutUser = 0
  let withoutValue = 0

  const preparedRows = completedRows.map((row) => {
    const typeName = textOrNull(row.workType) || 'Tarefa sem tipo'
    const typeKey = normalizeWmsTaskKey(typeName)
    const userName = textOrNull(row.userName)
    const candidates = usersByName.get(normalizeWmsTaskKey(userName)) || []
    const matchedUser = candidates.length === 1 ? candidates[0] : null
    const config = configByKey.get(typeKey)
    const unitValue = config?.ativo ? Number(config.valor_unitario || 0) : 0

    if (matchedUser) linked += 1
    else withoutUser += 1

    if (unitValue <= 0) withoutValue += 1

    return {
      row,
      typeName,
      typeKey,
      userName,
      userId: matchedUser ? Number(matchedUser.id) : null,
      unitValue,
      taskId: stableTaskId(date, row),
    }
  })

  // Neon é remoto. Inserir uma linha por vez deixava coletas grandes muito lentas.
  // Processamos pequenos lotes em paralelo para manter o endpoint dentro do tempo do cron.
  const batchSize = 25
  for (let start = 0; start < preparedRows.length; start += batchSize) {
    const batch = preparedRows.slice(start, start + batchSize)

    await Promise.all(
      batch.map(async (item) => {
        const { row, typeName, typeKey, userName, userId, unitValue, taskId } = item

        await sql`
          INSERT INTO wms_tarefas_registros (
            wms_task_id,
            data_ref,
            documento,
            origem,
            destino,
            palete,
            status,
            status_id,
            tipo_nome,
            tipo_chave,
            usuario_nome_wms,
            usuario_id,
            data_criacao,
            data_associacao,
            data_liberacao,
            data_alteracao,
            placa_cavalo,
            placa_carreta,
            tarefa,
            prioridade,
            valor_unitario,
            importado_em
          )
          VALUES (
            ${taskId},
            ${date}::date,
            ${textOrNull(row.documentNumber)},
            ${textOrNull(row.fromLocationCode)},
            ${textOrNull(row.locationCode)},
            ${textOrNull(row.palletDescription)},
            ${textOrNull(row.status)},
            ${numberOrNull(row.statusId)},
            ${typeName},
            ${typeKey},
            ${userName},
            ${userId},
            ${textOrNull(row.createdDateInfo)},
            ${textOrNull(row.lastAssociationDate)},
            ${textOrNull(row.releaseDate)},
            ${textOrNull(row.updatedDate)},
            ${textOrNull(row.truckPlate)},
            ${textOrNull(row.trailerPlate)},
            ${textOrNull(row.sequenceId)},
            ${textOrNull(row.priority)},
            ${unitValue},
            NOW()
          )
          ON CONFLICT (wms_task_id)
          DO UPDATE SET
            documento = EXCLUDED.documento,
            origem = EXCLUDED.origem,
            destino = EXCLUDED.destino,
            palete = EXCLUDED.palete,
            status = EXCLUDED.status,
            status_id = EXCLUDED.status_id,
            tipo_nome = EXCLUDED.tipo_nome,
            usuario_nome_wms = COALESCE(EXCLUDED.usuario_nome_wms, wms_tarefas_registros.usuario_nome_wms),
            usuario_id = COALESCE(wms_tarefas_registros.usuario_id, EXCLUDED.usuario_id),
            data_criacao = EXCLUDED.data_criacao,
            data_associacao = EXCLUDED.data_associacao,
            data_liberacao = EXCLUDED.data_liberacao,
            data_alteracao = EXCLUDED.data_alteracao,
            placa_cavalo = EXCLUDED.placa_cavalo,
            placa_carreta = EXCLUDED.placa_carreta,
            tarefa = EXCLUDED.tarefa,
            prioridade = EXCLUDED.prioridade
        `
      }),
    )
  }

  await sql`
    INSERT INTO wms_tarefa_coletas (
      data_ref,
      status,
      source,
      total_recebido,
      total_completo,
      total_vinculado,
      total_sem_usuario,
      total_sem_valor,
      mensagem,
      atualizado_em
    )
    VALUES (
      ${date}::date,
      'ok',
      ${source || null},
      ${allRows.length},
      ${completedRows.length},
      ${linked},
      ${withoutUser},
      ${withoutValue},
      NULL,
      NOW()
    )
    ON CONFLICT (data_ref)
    DO UPDATE SET
      status = 'ok',
      source = EXCLUDED.source,
      total_recebido = EXCLUDED.total_recebido,
      total_completo = EXCLUDED.total_completo,
      total_vinculado = EXCLUDED.total_vinculado,
      total_sem_usuario = EXCLUDED.total_sem_usuario,
      total_sem_valor = EXCLUDED.total_sem_valor,
      mensagem = NULL,
      atualizado_em = NOW()
  `

  return {
    date,
    total: allRows.length,
    completed: completedRows.length,
    linked,
    withoutUser,
    withoutValue,
  }
}

export async function saveWmsTaskFailure({ date, message }) {
  await ensureWmsTaskSchema()

  await sql`
    INSERT INTO wms_tarefa_coletas (
      data_ref,
      status,
      mensagem,
      atualizado_em
    )
    VALUES (
      ${date}::date,
      'erro',
      ${String(message || 'Falha na coleta das tarefas WMS.')},
      NOW()
    )
    ON CONFLICT (data_ref)
    DO UPDATE SET
      status = 'erro',
      mensagem = EXCLUDED.mensagem,
      atualizado_em = NOW()
  `
}

export function previousIsoDate(date) {
  const [year, month, day] = String(date).split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}

function isCompletedTask(row) {
  const statusId = Number(row?.statusId)
  if (statusId === 1) return true

  const status = normalizeWmsTaskKey(row?.status)
  return ['COMPLETA', 'COMPLETED', 'CONCLUIDA', 'CONCLUIDO'].includes(status)
}

function stableTaskId(date, row) {
  const direct = String(row?.id ?? '').trim()
  if (direct) return direct

  const fingerprint = [
    date,
    row?.sequenceId,
    row?.documentNumber,
    row?.workType,
    row?.userName,
    row?.fromLocationCode,
    row?.locationCode,
    row?.createdDateInfo,
  ].map((value) => String(value ?? '').trim()).join('|')

  return `fallback-${crypto.createHash('sha256').update(fingerprint).digest('hex')}`
}

function textOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
