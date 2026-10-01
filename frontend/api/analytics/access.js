import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

let schemaPromise = null

export default async function handler(req, res) {
  const usuario = await getSessionUser(req)

  if (!usuario) {
    return res.status(401).json({
      status: 'error',
      message: 'Sessão não autenticada.',
    })
  }

  try {
    await ensureSchema()

    if (req.method === 'POST') {
      const date = bahiaDate()
      const source = String(req.body?.origem || 'app').trim().slice(0, 40)

      await sql`
        INSERT INTO acessos_diarios (
          data_ref,
          usuario_id,
          usuario_nome,
          turno,
          cargo,
          perfil,
          acessos,
          primeiro_acesso,
          ultimo_acesso,
          origem
        )
        VALUES (
          ${date}::date,
          ${usuario.id},
          ${usuario.nome},
          ${usuario.turno || null},
          ${usuario.cargo || null},
          ${usuario.perfil || null},
          1,
          NOW(),
          NOW(),
          ${source}
        )
        ON CONFLICT (data_ref, usuario_id)
        DO UPDATE SET
          usuario_nome = EXCLUDED.usuario_nome,
          turno = EXCLUDED.turno,
          cargo = EXCLUDED.cargo,
          perfil = EXCLUDED.perfil,
          acessos = acessos_diarios.acessos + 1,
          ultimo_acesso = NOW(),
          origem = EXCLUDED.origem
      `

      return res.status(200).json({
        status: 'ok',
        data: date,
      })
    }

    if (req.method === 'GET') {
      if (String(usuario.perfil || '').toUpperCase() !== 'ADM') {
        return res.status(403).json({
          status: 'error',
          message: 'Acesso restrito ao administrador.',
        })
      }

      const today = bahiaDate()
      const from = normalizeDate(req.query?.from) || addDays(today, -6)
      const to = normalizeDate(req.query?.to) || today

      if (from > to) {
        return res.status(400).json({
          status: 'error',
          message: 'A data inicial não pode ser maior que a final.',
        })
      }

      const [summaryRows, dailyRows, userRows, recentRows] = await Promise.all([
        sql`
          SELECT
            COALESCE(SUM(acessos), 0)::int AS acessos,
            COUNT(DISTINCT usuario_id)::int AS usuarios_unicos
          FROM acessos_diarios
          WHERE data_ref BETWEEN ${from}::date AND ${to}::date
        `,
        sql`
          SELECT
            data_ref,
            COALESCE(SUM(acessos), 0)::int AS acessos,
            COUNT(DISTINCT usuario_id)::int AS usuarios_unicos
          FROM acessos_diarios
          WHERE data_ref BETWEEN ${from}::date AND ${to}::date
          GROUP BY data_ref
          ORDER BY data_ref
        `,
        sql`
          SELECT
            usuario_id,
            MAX(usuario_nome) AS usuario_nome,
            MAX(turno) AS turno,
            MAX(cargo) AS cargo,
            MAX(perfil) AS perfil,
            COALESCE(SUM(acessos), 0)::int AS acessos,
            COUNT(DISTINCT data_ref)::int AS dias_ativos,
            MIN(primeiro_acesso) AS primeiro_acesso,
            MAX(ultimo_acesso) AS ultimo_acesso
          FROM acessos_diarios
          WHERE data_ref BETWEEN ${from}::date AND ${to}::date
          GROUP BY usuario_id
          ORDER BY acessos DESC, usuario_nome
        `,
        sql`
          SELECT
            data_ref,
            usuario_id,
            usuario_nome,
            turno,
            cargo,
            perfil,
            acessos,
            primeiro_acesso,
            ultimo_acesso
          FROM acessos_diarios
          WHERE data_ref BETWEEN ${from}::date AND ${to}::date
          ORDER BY ultimo_acesso DESC
          LIMIT 100
        `,
      ])

      const todayRows = await sql`
        SELECT
          COALESCE(SUM(acessos), 0)::int AS acessos,
          COUNT(DISTINCT usuario_id)::int AS usuarios_unicos
        FROM acessos_diarios
        WHERE data_ref = ${today}::date
      `

      return res.status(200).json({
        status: 'ok',
        from,
        to,
        hoje: {
          data: today,
          acessos: Number(todayRows[0]?.acessos || 0),
          usuarios_unicos: Number(todayRows[0]?.usuarios_unicos || 0),
        },
        resumo: {
          acessos: Number(summaryRows[0]?.acessos || 0),
          usuarios_unicos: Number(summaryRows[0]?.usuarios_unicos || 0),
        },
        dias: dailyRows.map((row) => ({
          data: isoDate(row.data_ref),
          acessos: Number(row.acessos || 0),
          usuarios_unicos: Number(row.usuarios_unicos || 0),
        })),
        usuarios: userRows.map((row) => ({
          usuario_id: Number(row.usuario_id),
          usuario_nome: row.usuario_nome,
          turno: row.turno || '',
          cargo: row.cargo || '',
          perfil: row.perfil || '',
          acessos: Number(row.acessos || 0),
          dias_ativos: Number(row.dias_ativos || 0),
          primeiro_acesso: row.primeiro_acesso,
          ultimo_acesso: row.ultimo_acesso,
        })),
        recentes: recentRows.map((row) => ({
          data: isoDate(row.data_ref),
          usuario_id: Number(row.usuario_id),
          usuario_nome: row.usuario_nome,
          turno: row.turno || '',
          cargo: row.cargo || '',
          perfil: row.perfil || '',
          acessos: Number(row.acessos || 0),
          primeiro_acesso: row.primeiro_acesso,
          ultimo_acesso: row.ultimo_acesso,
        })),
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  } catch (error) {
    console.error('access_analytics_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar os dados de acesso.',
    })
  }
}

function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = createSchema().catch((error) => {
      schemaPromise = null
      throw error
    })
  }
  return schemaPromise
}

async function createSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS acessos_diarios (
      data_ref DATE NOT NULL,
      usuario_id BIGINT NOT NULL,
      usuario_nome VARCHAR(220) NOT NULL,
      turno VARCHAR(100),
      cargo VARCHAR(160),
      perfil VARCHAR(80),
      acessos INTEGER NOT NULL DEFAULT 0,
      primeiro_acesso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ultimo_acesso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      origem VARCHAR(40),
      PRIMARY KEY (data_ref, usuario_id)
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_acessos_diarios_data
    ON acessos_diarios(data_ref DESC)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_acessos_diarios_ultimo
    ON acessos_diarios(ultimo_acesso DESC)
  `
}

function bahiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bahia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const get = (type) => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function addDays(iso, amount) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function isoDate(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  return new Date(value).toISOString().slice(0, 10)
}
