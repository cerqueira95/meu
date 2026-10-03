import crypto from 'node:crypto'
import postgres from 'postgres'

const TABLES = [
  'usuarios',
  'login_logs',
  'configuracoes',
  'sessoes',
  'acessos_rapidos',
  'armazem_publicacoes',
  'armazem_comentarios',
  'armazem_reacoes',
  'wms_rateio_coletas',
  'wms_rateio_registros',
  'wms_item_coletas',
  'wms_item_registros',
  'escalonada_resultados',
  'escalonada_notificacoes',
]

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))

  if (a.length !== b.length || a.length === 0) {
    return false
  }

  return crypto.timingSafeEqual(a, b)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  }

  const migrationSecret = process.env.MIGRATION_SECRET || ''
  if (!migrationSecret || !safeEqual(req.query?.token, migrationSecret)) {
    return res.status(401).json({ status: 'error', message: 'Não autorizado.' })
  }

  const sourceUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ''

  if (!sourceUrl) {
    return res.status(500).json({ status: 'error', message: 'Banco de origem não configurado.' })
  }

  const source = postgres(sourceUrl, {
    max: 1,
    prepare: false,
    ssl: 'require',
    connect_timeout: 15,
  })

  try {
    const counts = {}

    for (const table of TABLES) {
      const exists = await source`
        SELECT to_regclass(${'public.' + table}) IS NOT NULL AS exists
      `

      if (!exists[0]?.exists) {
        counts[table] = null
        continue
      }

      const rows = await source.unsafe(
        'SELECT COUNT(*)::bigint AS total FROM public."' +
          table.replaceAll('"', '""') +
          '"',
      )

      counts[table] = Number(rows[0]?.total || 0)
    }

    return res.status(200).json({
      status: 'ok',
      source: 'legacy_database',
      counts,
    })
  } finally {
    await source.end({ timeout: 5 })
  }
}
