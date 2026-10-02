import ExcelJS from 'exceljs'
import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import { ensureActivitiesSchema, serializeActivityBatch } from '../_lib/activities.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default async function handler(req, res) {
  const usuario = await getSessionUser(req)
  if (!usuario) return res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })

  try {
    await ensureActivitiesSchema()
    const isAdmin = String(usuario.perfil || '').toUpperCase() === 'ADM'
    const from = validDate(req.query?.from) || firstDayOfMonth()
    const to = validDate(req.query?.to) || currentBahiaDate()
    if (from > to) return res.status(400).json({ status: 'error', message: 'O período informado é inválido.' })

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
    }

    const mode = String(req.query?.mode || 'history').toLowerCase()
    if (mode === 'report') {
      if (!isAdmin) return res.status(403).json({ status: 'error', message: 'Apenas administradores podem exportar o relatório consolidado.' })
      return exportReport(res, from, to)
    }

    const status = ['aprovado', 'reprovado', 'todos'].includes(String(req.query?.status || '').toLowerCase())
      ? String(req.query.status).toLowerCase()
      : 'todos'
    const activity = String(req.query?.activity || '').trim()
    const requestedUserId = Number(req.query?.user_id || 0)
    const userId = isAdmin && Number.isInteger(requestedUserId) && requestedUserId > 0
      ? requestedUserId
      : isAdmin ? 0 : usuario.id

    const rows = await sql`
      SELECT
        l.*,
        COALESCE(
          (SELECT json_agg(p ORDER BY CASE WHEN p.papel = 'principal' THEN 0 ELSE 1 END, p.usuario_nome)
           FROM atividade_lancamento_participantes p WHERE p.lancamento_id = l.id),
          '[]'::json
        ) AS participantes_json,
        COALESCE(
          (SELECT json_agg(i ORDER BY i.id)
           FROM atividade_lancamento_itens i WHERE i.lancamento_id = l.id),
          '[]'::json
        ) AS itens_json
      FROM atividade_lancamentos l
      WHERE l.data_atividade BETWEEN ${from}::date AND ${to}::date
        AND l.status IN ('aprovado', 'reprovado')
        AND (${status} = 'todos' OR l.status = ${status})
        AND (${activity} = '' OR l.atividade_chave = ${activity})
        AND (
          ${userId} = 0 OR EXISTS (
            SELECT 1 FROM atividade_lancamento_participantes px
            WHERE px.lancamento_id = l.id AND px.usuario_id = ${userId}
          )
        )
      ORDER BY l.data_atividade DESC, l.id DESC
      LIMIT 500
    `

    const [users, activities] = isAdmin
      ? await Promise.all([
          sql`SELECT id, nome FROM usuarios WHERE status = 'ativo' ORDER BY nome`,
          sql`SELECT chave, nome FROM atividade_catalogo WHERE ativo = TRUE ORDER BY nome`,
        ])
      : [[], await sql`SELECT chave, nome FROM atividade_catalogo WHERE ativo = TRUE ORDER BY nome`]

    const lancamentos = rows.map((row) => {
      const batch = serializeActivityBatch(row, row.participantes_json || [], row.itens_json || [])
      if (!isAdmin) {
        batch.participantes = batch.participantes.filter((person) => person.usuario_id === usuario.id)
        batch.valor_grupo = batch.participantes.reduce((sum, person) => sum + Number(person.valor_total || 0), 0)
        batch.valor_individual = batch.participantes[0]?.valor_total || 0
      }
      return batch
    })

    return res.status(200).json({
      status: 'ok',
      is_admin: isAdmin,
      periodo: { from, to },
      filtros: { status, activity, user_id: userId || null },
      usuarios: users.map((row) => ({ id: Number(row.id), nome: row.nome })),
      atividades: activities.map((row) => ({ chave: row.chave, nome: row.nome })),
      lancamentos,
    })
  } catch (error) {
    console.error('activity_history_error', error)
    return res.status(500).json({ status: 'error', message: 'Não foi possível carregar o histórico de atividades.' })
  }
}

async function exportReport(res, from, to) {
  const [activityRows, activityTotals, escalonadaRows, wmsRows] = await Promise.all([
    sql`
      SELECT DISTINCT l.atividade_chave AS chave, l.atividade_nome AS nome
      FROM atividade_lancamentos l
      WHERE l.status = 'aprovado' AND l.data_atividade BETWEEN ${from}::date AND ${to}::date
      ORDER BY l.atividade_nome
    `,
    sql`
      SELECT
        p.usuario_id,
        MAX(p.usuario_nome) AS usuario_nome,
        l.atividade_chave,
        MAX(l.atividade_nome) AS atividade_nome,
        SUM(
          COALESCE(NULLIF((l.detalhes->>'quantidade_calculo')::numeric, 0), NULLIF(ic.qtd_itens, 0), 1)
          * COALESCE(p.valor_unitario, l.valor_unitario, 0)
        )::numeric AS valor
      FROM atividade_lancamentos l
      INNER JOIN atividade_lancamento_participantes p ON p.lancamento_id = l.id
      LEFT JOIN (
        SELECT lancamento_id, COUNT(*)::numeric AS qtd_itens
        FROM atividade_lancamento_itens GROUP BY lancamento_id
      ) ic ON ic.lancamento_id = l.id
      WHERE l.status = 'aprovado' AND l.data_atividade BETWEEN ${from}::date AND ${to}::date
      GROUP BY p.usuario_id, l.atividade_chave
    `,
    sql`
      SELECT usuario_id, MAX(usuario_nome) AS usuario_nome, SUM(incentivo)::numeric AS valor
      FROM escalonada_resultados
      WHERE data_ref BETWEEN ${from}::date AND ${to}::date AND usuario_id IS NOT NULL
      GROUP BY usuario_id
    `,
    sql`
      SELECT
        COALESCE(e.usuario_id, u.id) AS usuario_id,
        MAX(COALESCE(u.nome, e.usuario_nome, r.usuario_nome)) AS usuario_nome,
        SUM(r.valor)::numeric AS valor
      FROM wms_rateio_registros r
      LEFT JOIN escalonada_resultados e
        ON e.data_ref = r.data_ref AND e.wms_usuario_id = r.wms_usuario_id
      LEFT JOIN usuarios u
        ON u.id = e.usuario_id OR u.wms_usuario_id = r.wms_usuario_id
      WHERE r.data_ref BETWEEN ${from}::date AND ${to}::date
        AND COALESCE(e.usuario_id, u.id) IS NOT NULL
      GROUP BY COALESCE(e.usuario_id, u.id)
    `,
  ])

  const activityMap = new Map(activityRows.map((row) => [row.chave, row.nome]))
  for (const row of activityTotals) if (!activityMap.has(row.atividade_chave)) activityMap.set(row.atividade_chave, row.atividade_nome)
  const activities = [...activityMap.entries()].map(([key, name]) => ({ key, name }))

  const people = new Map()
  const ensure = (id, name) => {
    const key = Number(id)
    if (!people.has(key)) people.set(key, { id: key, nome: name || ('Usuário ' + key), atividades: {}, escalonada: 0, wms: 0 })
    else if (name) people.get(key).nome = name
    return people.get(key)
  }
  for (const row of activityTotals) ensure(row.usuario_id, row.usuario_nome).atividades[row.atividade_chave] = money(row.valor)
  for (const row of escalonadaRows) ensure(row.usuario_id, row.usuario_nome).escalonada = money(row.valor)
  for (const row of wmsRows) ensure(row.usuario_id, row.usuario_nome).wms = money(row.valor)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Warehouse'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('RV por usuário', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] })
  const columns = [
    { header: 'Nome', key: 'nome', width: 36 },
    ...activities.map((item, index) => ({ header: item.name, key: 'a' + index, width: Math.max(16, Math.min(30, item.name.length + 3)) })),
    { header: 'Escalonada', key: 'escalonada', width: 16 },
    { header: 'RV WMS', key: 'wms', width: 16 },
    { header: 'Total', key: 'total', width: 18 },
  ]
  sheet.columns = columns

  const ordered = [...people.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  for (const person of ordered) {
    const row = { nome: person.nome }
    let total = person.escalonada + person.wms
    activities.forEach((activity, index) => {
      const value = money(person.atividades[activity.key] || 0)
      row['a' + index] = value
      total += value
    })
    row.escalonada = person.escalonada
    row.wms = person.wms
    row.total = money(total)
    sheet.addRow(row)
  }

  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: 'middle', horizontal: 'center' }
  header.height = 24
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: columns.length } }
  for (let column = 2; column <= columns.length; column += 1) {
    sheet.getColumn(column).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00;R$ 0.00'
  }
  sheet.getColumn(1).alignment = { vertical: 'middle' }

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `relatorio-rv-${from}-a-${to}.xlsx`
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Length', buffer.byteLength)
  return res.end(Buffer.from(buffer))
}

function validDate(value) {
  const text = String(value || '')
  return DATE_RE.test(text) ? text : ''
}

function currentBahiaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function firstDayOfMonth() {
  return currentBahiaDate().slice(0, 8) + '01'
}

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}
