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
    const result = await collectCurrentRateio()

    return res.status(200).json({
      status: 'ok',
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
