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

  if (String(usuario.perfil || '').toUpperCase() !== 'ADM') {
    return res.status(403).json({ status: 'error', message: 'Acesso restrito ao administrador.' })
  }

  const from = normalizeDate(req.query?.from)
  const to = normalizeDate(req.query?.to)

  if (!from || !to) {
    return res.status(400).json({ status: 'error', message: 'Informe a data inicial e final.' })
  }

  if (from > to) {
    return res.status(400).json({ status: 'error', message: 'A data inicial não pode ser maior que a final.' })
  }

  try {
    const rows = await sql`
      SELECT
        e.id,
        e.data_ref,
        e.usuario_nome,
        e.wms_login,
        e.pontuacao,
        e.valor_base,
        e.pickpack,
        e.pickpack_area,
        e.pickpack_qtd,
        e.percentual,
        e.incentivo,
        e.valor_total,
        u.id AS usuario_id,
        u.nome AS cadastro_nome
      FROM escalonada_resultados e
      LEFT JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.data_ref BETWEEN ${from}::date AND ${to}::date
      ORDER BY e.data_ref DESC, e.usuario_nome ASC
    `

    const resumoRows = await sql`
      SELECT
        COUNT(*)::int AS registros,
        COUNT(*) FILTER (WHERE incentivo > 0)::int AS ganhou,
        COUNT(*) FILTER (WHERE pickpack = TRUE)::int AS pickpack,
        COUNT(*) FILTER (WHERE incentivo = 0 AND pickpack = FALSE)::int AS sem_incentivo,
        COALESCE(SUM(valor_base), 0)::numeric AS valor_base,
        COALESCE(SUM(incentivo), 0)::numeric AS incentivo,
        COALESCE(SUM(valor_total), 0)::numeric AS valor_total
      FROM escalonada_resultados
      WHERE data_ref BETWEEN ${from}::date AND ${to}::date
    `

    const resumo = resumoRows[0] || {}

    return res.status(200).json({
      status: 'ok',
      from,
      to,
      resumo: {
        registros: Number(resumo.registros || 0),
        ganhou: Number(resumo.ganhou || 0),
        pickpack: Number(resumo.pickpack || 0),
        sem_incentivo: Number(resumo.sem_incentivo || 0),
        valor_base: Number(resumo.valor_base || 0),
        incentivo: Number(resumo.incentivo || 0),
        valor_total: Number(resumo.valor_total || 0),
      },
      resultados: rows.map((row) => ({
        id: Number(row.id),
        data_ref: row.data_ref,
        usuario_id: row.usuario_id ? Number(row.usuario_id) : null,
        usuario_nome: row.cadastro_nome || row.usuario_nome,
        wms_login: row.wms_login || null,
        pontuacao: Number(row.pontuacao || 0),
        valor_base: Number(row.valor_base || 0),
        pickpack: Boolean(row.pickpack),
        pickpack_area: row.pickpack_area || null,
        pickpack_qtd: Number(row.pickpack_qtd || 0),
        percentual: Number(row.percentual || 0),
        incentivo: Number(row.incentivo || 0),
        valor_total: Number(row.valor_total || 0),
        status: row.pickpack
          ? 'Pick&Pack'
          : Number(row.incentivo || 0) > 0
            ? 'Ganhou'
            : 'Não ganhou',
      })),
    })
  } catch (error) {
    console.error('escalonada_admin_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível carregar o relatório da escalonada.',
    })
  }
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}
