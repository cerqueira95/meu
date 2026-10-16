import { sql } from './_db.js'
import { cartaControle } from '../../../integrations/logan/carta-controle.mjs'

// Snapshots may contain the same operation in overlapping files.
// Keep newest version for each document and physical vehicle entry.
export async function readCartaRaw() {
  const tables = await sql`SELECT to_regclass('public.logan_registros') AS r, to_regclass('public.logan_importacoes') AS i`
  if (!tables[0]?.r || !tables[0]?.i) return { entradas: [], movimentos: [], ultimaImportacao: null, semFonte: true }
  const [entradasRows, movimentosRows, ultima] = await Promise.all([
    sql`SELECT id, dados FROM logan_registros WHERE tipo = 'entradas_saidas' ORDER BY id DESC`,
    sql`SELECT id, dados FROM logan_registros WHERE tipo = 'movimentacoes' ORDER BY id DESC`,
    sql`SELECT MAX(importado_em) AS em FROM logan_importacoes`,
  ])
  const entradas = new Map()
  for (const row of entradasRows) {
    const d = row.dados
    const doc = String(d.DT_ENTRADA ?? '').trim()
    const key = [doc, d.PLACA ?? '', d.DATA_ENTRADA ?? ''].join('|')
    if (doc && !entradas.has(key)) entradas.set(key, d)
  }
  const movimentos = new Map()
  for (const row of movimentosRows) {
    const d = row.dados
    if (String(d.PROCESSO ?? '').trim().toUpperCase() !== 'EMPURRADA') continue
    const doc = String(d.DOCUMENTO_DE_TRANSPORTE ?? '').trim()
    if (doc && !movimentos.has(doc)) movimentos.set(doc, d)
  }
  return { entradas: [...entradas.values()], movimentos: [...movimentos.values()], ultimaImportacao: ultima[0]?.em || null }
}

export async function readCartaReport(filters = {}) {
  const raw = await readCartaRaw()
  return { ...cartaControle(raw.entradas, raw.movimentos, filters), ultimaImportacao: raw.ultimaImportacao, semFonte: !!raw.semFonte }
}
