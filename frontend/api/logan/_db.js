import postgres from 'postgres'
import { sql as warehouseSql, withTransaction as warehouseTransaction } from '../_lib/db.js'

// LOGAN_DATABASE_URL is configured on Render separately. The Warehouse DB is unchanged.
let client = null
function getClient() {
  if (client) return client
  const connectionString = process.env.LOGAN_DATABASE_URL
  if (!connectionString) return null
  client = postgres(connectionString, {
    max: 3, prepare: false, connect_timeout: 15,
    idle_timeout: 20, ssl: 'require',
  })
  return client
}
export function sql(strings, ...values) {
  const conn = getClient()
  return conn ? conn(strings, ...values) : warehouseSql(strings, ...values)
}
export function withTransaction(callback) {
  const conn = getClient()
  return conn ? conn.begin(callback) : warehouseTransaction(callback)
}
export async function checkLoganConnection() {
  if (!process.env.LOGAN_DATABASE_URL) return { ok: false, reason: 'separate_url_not_configured' }
  try {
    const rows = await sql`SELECT to_regclass('public.logan_registros') AS registros,
      (SELECT count(*)::integer FROM public.logan_registros) AS total`
    return { ok: Boolean(rows[0]?.registros), total: rows[0]?.total ?? 0 }
  } catch (error) {
    return { ok: false, reason: error?.code || 'connection_failed' }
  }
}
