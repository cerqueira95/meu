import { sql } from './db.js'

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
  await sql`
    CREATE TABLE IF NOT EXISTS wms_operador_tarefas (
      wms_task_id VARCHAR(160) PRIMARY KEY,
      data_ref DATE NOT NULL,
      usuario_id BIGINT NOT NULL,
      usuario_nome VARCHAR(220) NOT NULL,
      usuario_nome_wms VARCHAR(220),
      tipo_nome VARCHAR(220) NOT NULL,
      documento VARCHAR(120),
      origem VARCHAR(180),
      destino VARCHAR(180),
      palete VARCHAR(180),
      tarefa VARCHAR(120),
      prioridade VARCHAR(80),
      data_criacao TEXT,
      importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_wms_operador_tarefas_data_usuario
    ON wms_operador_tarefas(data_ref, usuario_id)
  `
}

export async function saveOperatorTasks({ date, rows }) {
  await ensureOperatorTasksSchema()

  const users = await sql`
    SELECT id, nome
    FROM usuarios
    WHERE status = 'ativo'
      AND (
        UPPER(TRIM(COALESCE(perfil, ''))) = 'OPERADOR'
        OR UPPER(TRIM(COALESCE(cargo, ''))) = 'OPERADOR'
      )
    ORDER BY nome
  `

  const usersByName = new Map()
  for (const user of users) {
    const key = normalizeOperatorName(user.nome)
    if (!key) continue
    const list = usersByName.get(key) || []
    list.push(user)
    usersByName.set(key, list)
  }

  const matched = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const candidates = usersByName.get(normalizeOperatorName(row.userName)) || []
    if (candidates.length !== 1) continue

    const user = candidates[0]
    const taskId = String(row.id || '').trim()
    if (!taskId) continue

    matched.push({
      taskId,
      userId: Number(user.id),
      userName: user.nome,
      userNameWms: textOrNull(row.userName),
      typeName: textOrNull(row.workType) || 'Tarefa sem tipo',
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
          tipo_nome, documento, origem, destino, palete, tarefa, prioridade,
          data_criacao, importado_em
        )
        VALUES (
          ${item.taskId}, ${date}::date, ${item.userId}, ${item.userName}, ${item.userNameWms},
          ${item.typeName}, ${item.documentNumber}, ${item.fromLocationCode},
          ${item.locationCode}, ${item.palletDescription}, ${item.sequenceId},
          ${item.priority}, ${item.createdDateInfo}, NOW()
        )
        ON CONFLICT (wms_task_id)
        DO UPDATE SET
          data_ref = EXCLUDED.data_ref,
          usuario_id = EXCLUDED.usuario_id,
          usuario_nome = EXCLUDED.usuario_nome,
          usuario_nome_wms = EXCLUDED.usuario_nome_wms,
          tipo_nome = EXCLUDED.tipo_nome,
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
    total_operadores: users.length,
    total_vinculado: matched.length,
  }
}

export async function getOperatorTasksReport(from, to) {
  await ensureOperatorTasksSchema()

  const [summaryRows, groupedRows, detailRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS tarefas,
        COUNT(DISTINCT usuario_id)::int AS operadores,
        COUNT(DISTINCT tipo_nome)::int AS tipos
      FROM wms_operador_tarefas
      WHERE data_ref BETWEEN ${from}::date AND ${to}::date
    `,
    sql`
      SELECT
        usuario_id,
        usuario_nome,
        tipo_nome,
        COUNT(*)::int AS quantidade
      FROM wms_operador_tarefas
      WHERE data_ref BETWEEN ${from}::date AND ${to}::date
      GROUP BY usuario_id, usuario_nome, tipo_nome
      ORDER BY usuario_nome, quantidade DESC, tipo_nome
    `,
    sql`
      SELECT
        wms_task_id,
        data_ref,
        usuario_id,
        usuario_nome,
        tipo_nome,
        documento,
        origem,
        destino,
        palete,
        tarefa,
        prioridade,
        data_criacao
      FROM wms_operador_tarefas
      WHERE data_ref BETWEEN ${from}::date AND ${to}::date
      ORDER BY data_ref DESC, usuario_nome, tipo_nome, wms_task_id
      LIMIT 5000
    `,
  ])

  const summary = summaryRows[0] || {}

  return {
    resumo: {
      tarefas: Number(summary.tarefas || 0),
      operadores: Number(summary.operadores || 0),
      tipos: Number(summary.tipos || 0),
    },
    agrupado: groupedRows.map((row) => ({
      usuario_id: Number(row.usuario_id),
      usuario_nome: row.usuario_nome,
      tipo_nome: row.tipo_nome,
      quantidade: Number(row.quantidade || 0),
    })),
    tarefas: detailRows.map((row) => ({
      ...row,
      usuario_id: Number(row.usuario_id),
    })),
  }
}

function textOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}
