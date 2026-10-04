import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

let schemaPromise = null

export default async function handler(req, res) {
  try {
    await ensureSchema()

    if (req.method === 'POST') {
      const clientId = String(req.body?.client_id || '').trim().slice(0, 120)
      const version = String(req.body?.versao || '').trim().slice(0, 30)

      if (!clientId) {
        return res.status(400).json({
          status: 'error',
          message: 'Identificador do dispositivo não informado.',
        })
      }

      await sql`
        INSERT INTO app_downloads (
          data_ref,
          client_id,
          versao,
          user_agent,
          criado_em
        )
        VALUES (
          ${bahiaDate()}::date,
          ${clientId},
          ${version || null},
          ${String(req.headers?.['user-agent'] || '').slice(0, 500) || null},
          NOW()
        )
      `

      return res.status(201).json({ status: 'ok' })
    }

    if (req.method === 'GET') {
      const usuario = await getSessionUser(req)

      if (!usuario) {
        return res.status(401).json({
          status: 'error',
          message: 'Sessão não autenticada.',
        })
      }

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

      const [summaryRows, todayRows] = await Promise.all([
        sql`
          SELECT
            COUNT(*)::int AS downloads,
            COUNT(DISTINCT client_id)::int AS dispositivos_unicos
          FROM app_downloads
          WHERE data_ref BETWEEN ${from}::date AND ${to}::date
        `,
        sql`
          SELECT
            COUNT(*)::int AS downloads,
            COUNT(DISTINCT client_id)::int AS dispositivos_unicos
          FROM app_downloads
          WHERE data_ref = ${today}::date
        `,
      ])

      return res.status(200).json({
        status: 'ok',
        from,
        to,
        hoje: {
          data: today,
          downloads: Number(todayRows[0]?.downloads || 0),
          dispositivos_unicos: Number(todayRows[0]?.dispositivos_unicos || 0),
        },
        resumo: {
          downloads: Number(summaryRows[0]?.downloads || 0),
          dispositivos_unicos: Number(summaryRows[0]?.dispositivos_unicos || 0),
        },
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  } catch (error) {
    console.error('app_download_analytics_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar os downloads do aplicativo.',
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
    CREATE TABLE IF NOT EXISTS app_downloads (
      id BIGSERIAL PRIMARY KEY,
      data_ref DATE NOT NULL,
      client_id VARCHAR(120) NOT NULL,
      versao VARCHAR(30),
      user_agent VARCHAR(500),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_app_downloads_data
    ON app_downloads(data_ref DESC)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_app_downloads_client
    ON app_downloads(client_id)
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
