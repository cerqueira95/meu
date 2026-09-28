import { sql } from './_lib/db.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  try {
    const result = await sql\`SELECT NOW() AS now\`

    return res.status(200).json({
      status: 'ok',
      message: 'API Vercel funcionando.',
      database: 'connected',
      timestamp: result[0]?.now ?? new Date().toISOString(),
    })
  } catch (error) {
    console.error('health_error', error)

    return res.status(500).json({
      status: 'error',
      message: 'Banco de dados indisponível.',
      database: 'unavailable',
    })
  }
}
