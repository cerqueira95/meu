import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  }

  const usuario = await getSessionUser(req)
  if (!usuario) {
    return res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
  }

  try {
    const notificationId = Number(req.body?.id || 0)

    if (notificationId > 0) {
      await sql`
        UPDATE escalonada_notificacoes
        SET lida_em = COALESCE(lida_em, NOW()),
            atualizado_em = NOW()
        WHERE id = ${notificationId}
          AND usuario_id = ${usuario.id}
      `
    } else {
      await sql`
        UPDATE escalonada_notificacoes
        SET lida_em = COALESCE(lida_em, NOW()),
            atualizado_em = NOW()
        WHERE usuario_id = ${usuario.id}
          AND lida_em IS NULL
      `
    }

    return res.status(200).json({ status: 'ok', message: 'Notificações atualizadas.' })
  } catch (error) {
    console.error('escalonada_read_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível atualizar as notificações.',
    })
  }
}
