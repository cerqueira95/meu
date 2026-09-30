import { sql } from '../_lib/db.js'
import { currentBahiaDate } from '../_lib/wms-client.js'
import {
  ensureWmsTaskSchema,
  previousIsoDate,
} from '../_lib/wms-tasks.js'
import {
  collectWmsTasksD1D0,
  publicWmsTaskFailureMessage,
} from '../_lib/wms-task-sync.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  const expected = String(process.env.CRON_SECRET || '')
  const received = String(req.headers.authorization || '')

  if (!expected || received !== `Bearer ${expected}`) {
    return res.status(401).json({
      status: 'error',
      message: 'Cron não autorizado.',
    })
  }

  try {
    await ensureWmsTaskSchema()

    const today = currentBahiaDate()
    const yesterday = previousIsoDate(today)
    const dates = [yesterday, today]

    const collections = await sql`
      SELECT data_ref, status
      FROM wms_tarefa_coletas
      WHERE data_ref IN (${yesterday}::date, ${today}::date)
    `

    const statusByDate = new Map(
      collections.map((row) => [
        isoDate(row.data_ref),
        row.status,
      ]),
    )

    if (dates.every((date) => statusByDate.get(date) === 'ok')) {
      return res.status(200).json({
        status: 'ok',
        skipped: true,
        dates,
        message: 'Coletas D-1 e D0 das tarefas WMS já concluídas.',
      })
    }

    const result = await collectWmsTasksD1D0()

    return res.status(200).json({
      status: 'ok',
      skipped: false,
      ...result,
    })
  } catch (error) {
    console.error('wms_cron_tasks_error', {
      code: error?.code || null,
      status: error?.status || null,
      message: error?.message || 'unknown',
    })

    return res.status(502).json({
      status: 'error',
      message: publicWmsTaskFailureMessage(error),
    })
  }
}


function isoDate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  const text = String(value || '').trim()
  const direct = text.match(/^\d{4}-\d{2}-\d{2}/)
  if (direct) return direct[0]

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? text.slice(0, 10)
    : parsed.toISOString().slice(0, 10)
}
