import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  }

  try {
    const usuario = await getSessionUser(req)

    if (!usuario) {
      return res.status(401).json({
        status: 'error',
        message: 'Sessão não autenticada.',
      })
    }

    const rows = await sql`
      UPDATE usuarios
      SET noticias_lidas_ate = NOW(),
          atualizado_em = NOW()
      WHERE id = ${usuario.id}
      RETURNING noticias_lidas_ate
    `

    return res.status(200).json({
      status: 'ok',
      noticias_lidas_ate: rows[0]?.noticias_lidas_ate ?? new Date().toISOString(),
    })
  } catch (error) {
    console.error('news_read_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível marcar as notícias como lidas.',
    })
  }
}