import { sql } from '../_lib/db.js'
import { currentBahiaDate } from '../_lib/wms-client.js'
import {
  collectCurrentRateio,
  publicFailureMessage,
} from '../_lib/wms-sync.js'

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
    const date = currentBahiaDate()
    const [rateio, item] = await Promise.all([
      sql`
        SELECT status
        FROM wms_rateio_coletas
        WHERE data_ref = ${date}
        LIMIT 1
      `,
      sql`
        SELECT status
        FROM wms_item_coletas
        WHERE data_ref = ${date}
        LIMIT 1
      `,
    ])

    if (rateio[0]?.status === 'ok' && item[0]?.status === 'ok') {
      return res.status(200).json({
        status: 'ok',
        skipped: true,
        date,
        message: 'Coleta de hoje já concluída.',
      })
    }

    const result = await collectCurrentRateio()

    return res.status(200).json({
      status: 'ok',
      skipped: false,
      ...result,
    })
  } catch (error) {
    console.error('wms_cron_rateio_error', {
      code: error?.code || null,
      status: error?.status || null,
      message: error?.message || 'unknown',
    })

    return res.status(502).json({
      status: 'error',
      message: publicFailureMessage(error),
    })
  }
}
