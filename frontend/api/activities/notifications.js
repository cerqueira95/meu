import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import { ensureActivitiesSchema } from '../_lib/activities.js'

export default async function handler(req, res) {
  const usuario = await getSessionUser(req)

  if (!usuario) {
    return res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
  }

  try {
    await ensureActivitiesSchema()

    if (req.method === 'GET') {
      const [notifications, unread] = await Promise.all([
        sql`
          SELECT
            id,
            lancamento_id,
            tipo,
            titulo,
            mensagem,
            lida_em,
            criado_em
          FROM atividade_notificacoes
          WHERE usuario_id = ${usuario.id}
          ORDER BY criado_em DESC
          LIMIT 10
        `,
        sql`
          SELECT COUNT(*)::int AS count
          FROM atividade_notificacoes
          WHERE usuario_id = ${usuario.id}
            AND lida_em IS NULL
        `,
      ])

      return res.status(200).json({
        status: 'ok',
        nao_lidas: Number(unread[0]?.count || 0),
        notificacoes: notifications.map((item) => ({
          id: Number(item.id),
          lancamento_id: Number(item.lancamento_id),
          tipo: item.tipo,
          titulo: item.titulo,
          mensagem: item.mensagem,
          lida_em: item.lida_em,
          criado_em: item.criado_em,
        })),
      })
    }

    if (req.method === 'POST') {
      const id = Number(req.body?.id || 0)

      if (id > 0) {
        await sql`
          UPDATE atividade_notificacoes
          SET lida_em = COALESCE(lida_em, NOW()),
              atualizado_em = NOW()
          WHERE id = ${id}
            AND usuario_id = ${usuario.id}
        `
      } else {
        await sql`
          UPDATE atividade_notificacoes
          SET lida_em = COALESCE(lida_em, NOW()),
              atualizado_em = NOW()
          WHERE usuario_id = ${usuario.id}
            AND lida_em IS NULL
        `
      }

      return res.status(200).json({
        status: 'ok',
        message: 'Notificações de atividades atualizadas.',
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('activities_notifications_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível carregar as notificações de atividades.',
    })
  }
}
