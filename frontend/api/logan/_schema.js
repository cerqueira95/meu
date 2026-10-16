import { sql } from './_db.js'

let initialized = null
export async function ensureJustificativasSchema() {
  if (!initialized) initialized = (async () => {
    const rows = await sql`SELECT to_regclass('public.logan_tma_justificativas') AS atual,
      to_regclass('public.logan_tma_justificativas_historico') AS historico`
    if (!rows[0]?.atual || !rows[0]?.historico) {
      const err = new Error('Estrutura de justificativas Logan não encontrada.')
      err.code = 'LOGAN_SCHEMA_MISSING'
      throw err
    }
  })()
  try { await initialized } catch (err) { initialized = null; throw err }
}
