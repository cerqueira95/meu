import { sql } from './db.js'
import { currentBahiaDate } from './activities.js'

export async function ensureWalletSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS remuneracao_tetos (
      usuario_id BIGINT PRIMARY KEY,
      valor_teto NUMERIC(10,2),
      atualizado_por_usuario_id BIGINT,
      atualizado_por_nome VARCHAR(180),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_remuneracao_tetos_valor
    ON remuneracao_tetos(valor_teto)
  `
}

export function resolveMonth(value) {
  const text = String(value || '').trim()
  if (/^\d{4}-\d{2}$/.test(text)) return text
  return currentBahiaDate().slice(0, 7)
}

export function monthRange(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const start = `${year}-${String(monthNumber).padStart(2, '0')}-01`
  const nextYear = monthNumber === 12 ? year + 1 : year
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, endExclusive }
}
export function applyWalletCap(entries, capValue) {
  const cap = capValue == null ? null : Math.max(0, Number(capValue))
  let accumulated = 0

  return entries.map((entry) => {
    const original = Math.max(0, Number(entry.valor_original || 0))
    let credited = original

    if (cap != null) {
      const remaining = Math.max(0, cap - accumulated)
      credited = Math.min(original, remaining)
    }

    accumulated += credited

    return {
      ...entry,
      valor_original: roundMoney(original),
      valor_creditado: roundMoney(credited),
      valor_bloqueado_teto: roundMoney(original - credited),
      saldo_acumulado: roundMoney(accumulated),
    }
  })
}

export function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}
