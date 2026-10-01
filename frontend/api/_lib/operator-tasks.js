import { sql } from './db.js'
import {
  ensureWmsTaskSchema,
  normalizeWmsTaskKey,
} from './wms-tasks.js'

let schemaPromise = null

export function normalizeOperatorName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function ensureOperatorTasksSchema() {
  if (!schemaPromise) {
    schemaPromise = createSchema().catch((error) => {
      schemaPromise = null
      throw error
    })
  }
  return schemaPromise
}

async function createSchema() {
  await ensureWmsTaskSchema()

  await sql`
    CREATE TABLE IF NOT EXISTS wms_operador_tarefas (
      wms_task_id VARCHAR(160) PRIMARY KEY,
      data_ref DATE NOT NULL,
      usuario_id BIGINT NOT NULL,
      usuario_nome VARCHAR(220) NOT NULL,
      usuario_nome_wms VARCHAR(220),
      tipo_nome VARCHAR(220) NOT NULL,
      tipo_chave VARCHAR(220),
      documento VARCHAR(120),
      origem VARCHAR(180),
      destino VARCHAR(180),
      palete VARCHAR(180),
      tarefa VARCHAR(120),
      prioridade VARCHAR(80),
      data_criacao TEXT,
      valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
      importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    ALTER TABLE wms_operador_tarefas
    ADD COLUMN IF NOT EXISTS tipo_chave VARCHAR(220)
  `

  await sql`
    ALTER TABLE wms_operador_tarefas
    ADD COLUMN IF NOT EXISTS valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_wms_operador_tarefas_data_usuario
    ON wms_operador_tarefas(data_ref, usuario_id)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_wms_operador_tarefas_tipo
    ON wms_operador_tarefas(tipo_chave, data_ref)
  `

  // Migração em lote: evita milhares de consultas individuais ao abrir a carteira.
  await sql`
    UPDATE wms_operador_tarefas o
    SET tipo_chave = COALESCE(NULLIF(o.tipo_chave, ''), v.chave),
        valor_unitario = CASE
          WHEN COALESCE(o.valor_unitario, 0) = 0 AND v.ativo = TRUE
            THEN COALESCE(v.valor_unitario, 0)
          ELSE COALESCE(o.valor_unitario, 0)
        END
    FROM wms_tarefa_valores v
    WHERE v.chave = UPPER(
      REGEXP_REPLACE(
        TRANSLATE(
          COALESCE(NULLIF(o.tipo_chave, ''), o.tipo_nome),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'AAAAAEEEEIIIIOOOOOUUUUC'
        ),
        '\\s+',
        ' ',
        'g'
      )
    )
      AND (
        o.tipo_chave IS NULL
        OR o.tipo_chave = ''
        OR COALESCE(o.valor_unitario, 0) = 0
      )
  `

}

export async function saveOperatorTasks({ date, rows }) {
  await ensureOperatorTasksSchema()

  const completedRows = (Array.isArray(rows) ? rows : []).filter(isCompletedTask)

  // Qualquer tipo novo aparece na mesma configuração de valores das tarefas WMS.
  const taskTypes = new Map()
  for (const row of completedRows) {
    const name = textOrNull(row.workType)
    const key = normalizeWmsTaskKey(name)
    if (name && key && !taskTypes.has(key)) taskTypes.set(key, name)
  }

  for (const [key, name] of taskTypes) {
    await sql`
      INSERT INTO wms_tarefa_valores (
        chave, nome, valor_unitario, ativo, atualizado_em
      )
      VALUES (${key}, ${name}, 0, TRUE, NOW())
      ON CONFLICT (chave)
      DO UPDATE SET nome = EXCLUDED.nome
    `
  }

  const [users, configs] = await Promise.all([
    sql`
      SELECT id, nome
      FROM usuarios
      WHERE status = 'ativo'
        AND (
          UPPER(TRIM(COALESCE(perfil, ''))) = 'OPERADOR'
          OR UPPER(TRIM(COALESCE(cargo, ''))) = 'OPERADOR'
        )
      ORDER BY nome
    `,
    sql`
      SELECT chave, valor_unitario, ativo
      FROM wms_tarefa_valores
    `,
  ])

  const usersByName = new Map()
  for (const user of users) {
    const key = normalizeOperatorName(user.nome)
    if (!key) continue
    const list = usersByName.get(key) || []
    list.push(user)
    usersByName.set(key, list)
  }

  const configByKey = new Map(
    configs.map((row) => [
      normalizeWmsTaskKey(row.chave),
      {
        value: Number(row.valor_unitario || 0),
        active: Boolean(row.ativo),
      },
    ]),
  )

  const matched = []
  let semValor = 0

  for (const row of completedRows) {
    const candidates = usersByName.get(normalizeOperatorName(row.userName)) || []
    if (candidates.length !== 1) continue

    const user = candidates[0]
    const taskId = String(row.id || '').trim()
    if (!taskId) continue

    const typeName = textOrNull(row.workType) || 'Tarefa sem tipo'
    const typeKey = normalizeWmsTaskKey(typeName)
    const config = configByKey.get(typeKey)
    const unitValue = config?.active ? Number(config.value || 0) : 0
    if (unitValue <= 0) semValor += 1

    matched.push({
      taskId,
      userId: Number(user.id),
      userName: user.nome,
      userNameWms: textOrNull(row.userName),
      typeName,
      typeKey,
      unitValue,
      documentNumber: textOrNull(row.documentNumber),
      fromLocationCode: textOrNull(row.fromLocationCode),
      locationCode: textOrNull(row.locationCode),
      palletDescription: textOrNull(row.palletDescription),
      sequenceId: textOrNull(row.sequenceId),
      priority: textOrNull(row.priority),
      createdDateInfo: textOrNull(row.createdDateInfo),
    })
  }

  const ids = matched.map((item) => item.taskId)

  // O dia é tratado como uma fotografia do WMS: o que saiu da consulta sai da tabela,
  // e o que permaneceu é atualizado pelo ID real da tarefa. Assim nunca duplica.
  if (ids.length > 0) {
    await sql`
      DELETE FROM wms_operador_tarefas
      WHERE data_ref = ${date}::date
        AND wms_task_id <> ALL(${ids})
    `
  } else {
    await sql`
      DELETE FROM wms_operador_tarefas
      WHERE data_ref = ${date}::date
    `
  }

  const batchSize = 25
  for (let start = 0; start < matched.length; start += batchSize) {
    const batch = matched.slice(start, start + batchSize)

    await Promise.all(
      batch.map((item) => sql`
        INSERT INTO wms_operador_tarefas (
          wms_task_id, data_ref, usuario_id, usuario_nome, usuario_nome_wms,
          tipo_nome, tipo_chave, documento, origem, destino, palete, tarefa, prioridade,
          data_criacao, valor_unitario, importado_em
        )
        VALUES (
          ${item.taskId}, ${date}::date, ${item.userId}, ${item.userName}, ${item.userNameWms},
          ${item.typeName}, ${item.typeKey}, ${item.documentNumber}, ${item.fromLocationCode},
          ${item.locationCode}, ${item.palletDescription}, ${item.sequenceId},
          ${item.priority}, ${item.createdDateInfo}, ${item.unitValue}, NOW()
        )
        ON CONFLICT (wms_task_id)
        DO UPDATE SET
          data_ref = EXCLUDED.data_ref,
          usuario_id = EXCLUDED.usuario_id,
          usuario_nome = EXCLUDED.usuario_nome,
          usuario_nome_wms = EXCLUDED.usuario_nome_wms,
          tipo_nome = EXCLUDED.tipo_nome,
          tipo_chave = EXCLUDED.tipo_chave,
          documento = EXCLUDED.documento,
          origem = EXCLUDED.origem,
          destino = EXCLUDED.destino,
          palete = EXCLUDED.palete,
          tarefa = EXCLUDED.tarefa,
          prioridade = EXCLUDED.prioridade,
          data_criacao = EXCLUDED.data_criacao,
          importado_em = NOW()
      `),
    )
  }

  return {
    date,
    total_recebido: Array.isArray(rows) ? rows.length : 0,
    total_completo: completedRows.length,
    total_operadores: users.length,
    total_vinculado: matched.length,
    total_sem_valor: semValor,
    valor_calculado: matched.reduce((sum, item) => sum + item.unitValue, 0),
  }
}

export async function getOperatorTasksReport(from, to) {
  await ensureOperatorTasksSchema()

  const [summaryRows, groupedRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS tarefas,
        COUNT(DISTINCT usuario_id)::int AS operadores,
        COUNT(DISTINCT tipo_nome)::int AS tipos,
        COALESCE(SUM(valor_unitario), 0)::numeric AS valor
      FROM wms_operador_tarefas
      WHERE data_ref BETWEEN ${from}::date AND ${to}::date
    `,
    sql`
      SELECT
        usuario_id,
        usuario_nome,
        tipo_nome,
        tipo_chave,
        valor_unitario,
        COUNT(*)::int AS quantidade,
        COALESCE(SUM(valor_unitario), 0)::numeric AS valor
      FROM wms_operador_tarefas
      WHERE data_ref BETWEEN ${from}::date AND ${to}::date
      GROUP BY usuario_id, usuario_nome, tipo_nome, tipo_chave, valor_unitario
      ORDER BY usuario_nome, quantidade DESC, tipo_nome
    `,
  ])

  const summary = summaryRows[0] || {}

  return {
    resumo: {
      tarefas: Number(summary.tarefas || 0),
      operadores: Number(summary.operadores || 0),
      tipos: Number(summary.tipos || 0),
      valor: Number(summary.valor || 0),
    },
    agrupado: groupedRows.map((row) => ({
      usuario_id: Number(row.usuario_id),
      usuario_nome: row.usuario_nome,
      tipo_nome: row.tipo_nome,
      tipo_chave: row.tipo_chave,
      valor_unitario: Number(row.valor_unitario || 0),
      quantidade: Number(row.quantidade || 0),
      valor: Number(row.valor || 0),
    })),
  }
}

function isCompletedTask(row) {
  const statusId = Number(row?.statusId)
  if (statusId === 1) return true
  const status = normalizeWmsTaskKey(row?.status)
  return ['COMPLETA', 'COMPLETED', 'CONCLUIDA', 'CONCLUIDO'].includes(status)
}

function textOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}
