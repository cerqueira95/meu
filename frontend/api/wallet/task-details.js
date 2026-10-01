import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import { ensureWmsTaskSchema } from '../_lib/wms-tasks.js'
import { ensureOperatorTasksSchema } from '../_lib/operator-tasks.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  const usuario = await getSessionUser(req)
  if (!usuario) {
    return res.status(401).json({
      status: 'error',
      message: 'Sessão não autenticada.',
    })
  }

  try {
    await Promise.all([
      ensureWmsTaskSchema(),
      ensureOperatorTasksSchema(),
    ])

    const date = normalizeDate(req.query?.data)
    const key = String(req.query?.chave || '').trim()
    const origin = String(req.query?.origem || 'empilhadeira').trim().toLowerCase()

    if (!date || !key) {
      return res.status(400).json({
        status: 'error',
        message: 'Informe a data e o tipo da tarefa.',
      })
    }

    const rows = origin === 'operador'
      ? await sql`
          SELECT
            wms_task_id,
            data_ref,
            documento,
            origem,
            destino,
            palete,
            tipo_nome,
            tarefa,
            prioridade,
            valor_unitario
          FROM wms_operador_tarefas
          WHERE usuario_id = ${usuario.id}
            AND data_ref = ${date}::date
            AND tipo_chave = ${key}
          ORDER BY wms_task_id
          LIMIT 500
        `
      : await sql`
          SELECT
            wms_task_id,
            data_ref,
            documento,
            origem,
            destino,
            palete,
            tipo_nome,
            tarefa,
            prioridade,
            valor_unitario
          FROM wms_tarefas_registros
          WHERE usuario_id = ${usuario.id}
            AND data_ref = ${date}::date
            AND tipo_chave = ${key}
          ORDER BY wms_task_id
          LIMIT 500
        `

    const total = rows.reduce(
      (sum, row) => sum + Number(row.valor_unitario || 0),
      0,
    )

    return res.status(200).json({
      status: 'ok',
      origem: origin,
      data: date,
      tipo: rows[0]?.tipo_nome || key,
      quantidade: rows.length,
      valor_unitario: rows[0] ? Number(rows[0].valor_unitario || 0) : 0,
      total,
      tarefas: rows.map((row) => ({
        id: row.wms_task_id,
        documento: row.documento || '',
        origem: row.origem || '',
        destino: row.destino || '',
        palete: row.palete || '',
        tarefa: row.tarefa || '',
        prioridade: row.prioridade || '',
        valor: Number(row.valor_unitario || 0),
      })),
    })
  } catch (error) {
    console.error('wallet_task_details_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível carregar os detalhes das tarefas.',
    })
  }
}

function normalizeDate(value) {
  const text = String(value || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}
