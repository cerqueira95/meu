import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  }

  const usuario = await getSessionUser(req)
  if (!usuario) {
    return res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
  }

  try {
    const [rows, totals, notifications, unread] = await Promise.all([
      sql`
        SELECT id, data_ref, pontuacao, valor_base, pickpack, pickpack_area,
               pickpack_qtd, percentual, incentivo, valor_total, atualizado_em
        FROM escalonada_resultados
        WHERE usuario_id = ${usuario.id}
        ORDER BY data_ref DESC
      `,
      sql`
        SELECT
          COALESCE(SUM(valor_base), 0)::numeric AS valor_base,
          COALESCE(SUM(incentivo), 0)::numeric AS incentivo,
          COALESCE(SUM(valor_total), 0)::numeric AS valor_total,
          COUNT(*)::int AS dias,
          COUNT(*) FILTER (WHERE incentivo > 0)::int AS dias_com_escalonada
        FROM escalonada_resultados
        WHERE usuario_id = ${usuario.id}
      `,
      sql`
        SELECT
          n.id, n.titulo, n.mensagem, n.lida_em, n.criado_em,
          r.data_ref, r.percentual, r.incentivo, r.valor_total
        FROM escalonada_notificacoes n
        INNER JOIN escalonada_resultados r ON r.id = n.resultado_id
        WHERE n.usuario_id = ${usuario.id}
        ORDER BY n.criado_em DESC
        LIMIT 8
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM escalonada_notificacoes
        WHERE usuario_id = ${usuario.id}
          AND lida_em IS NULL
      `,
    ])

    const total = totals[0] || {}

    return res.status(200).json({
      status: 'ok',
      nao_lidas: Number(unread[0]?.count || 0),
      totais: {
        valor_base: Number(total.valor_base || 0),
        incentivo: Number(total.incentivo || 0),
        valor_total: Number(total.valor_total || 0),
        dias: Number(total.dias || 0),
        dias_com_escalonada: Number(total.dias_com_escalonada || 0),
      },
      resultados: rows.map((row) => ({
        id: Number(row.id),
        data_ref: row.data_ref,
        pontuacao: Number(row.pontuacao || 0),
        valor_base: Number(row.valor_base || 0),
        pickpack: Boolean(row.pickpack),
        pickpack_area: row.pickpack_area ?? null,
        pickpack_qtd: Number(row.pickpack_qtd || 0),
        percentual: Number(row.percentual || 0),
        incentivo: Number(row.incentivo || 0),
        valor_total: Number(row.valor_total || 0),
        atualizado_em: row.atualizado_em,
      })),
      notificacoes: notifications.map((row) => ({
        id: Number(row.id),
        titulo: row.titulo,
        mensagem: row.mensagem,
        lida_em: row.lida_em,
        criado_em: row.criado_em,
        data_ref: row.data_ref,
        percentual: Number(row.percentual || 0),
        incentivo: Number(row.incentivo || 0),
        valor_total: Number(row.valor_total || 0),
      })),
    })
  } catch (error) {
    console.error('escalonada_list_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível carregar sua escalonada.',
    })
  }
}
