import crypto from 'node:crypto'
import { withTransaction } from './_db.js'

// Shared by manual trigger and future scheduled job. Requires an AUTHORIZED export collector.
const TYPES = [['entradas_saidas', 'DT_ENTRADA'], ['movimentacoes', 'DOCUMENTO_DE_TRANSPORTE']]
const sha = text => crypto.createHash('sha256').update(text).digest('hex')
const canonicalHash = data => sha(JSON.stringify(Object.keys(data).sort().map(k => [k, String(data[k] ?? '').trim()])))
let collecting = false

export const collectorConfigured = () => Boolean(process.env.LOGAN_COLLECTOR_URL && process.env.LOGAN_COLLECTOR_TOKEN)

function dayBahia(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value]))
  return p.year + '-' + p.month + '-' + p.day
}
export function reportWindow(now = new Date()) {
  const dateTo = dayBahia(now)
  const dateFrom = dayBahia(new Date(Date.parse(dateTo + 'T12:00:00Z') - 86400000))
  return { dateFrom, dateTo, timezone: 'America/Bahia' }
}
export function validateCollectorPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Resposta inválida do coletor Logan')
  return TYPES.map(([tipo, key]) => {
    const lines = payload[tipo]
    if (!Array.isArray(lines) || lines.length > 10000) throw Error('Formato ou tamanho inválido: ' + tipo)
    const seen = new Set()
    const rows = []
    for (const original of lines) {
      if (!original || typeof original !== 'object' || Array.isArray(original)) throw Error('Linha inválida: ' + tipo)
      const entries = Object.entries(original)
      if (entries.length < 3 || entries.length > 100) throw Error('Número de colunas inválido: ' + tipo)
      const dados = Object.fromEntries(entries.map(([field, value]) => [field, String(value ?? '').trim()]))
      if ((tipo === 'entradas_saidas' && (!dados[key] || !(dados.PLACA || dados.PLACA_CARRETA_ENTRADA))) || (tipo === 'movimentacoes' && !(dados[key] || dados.PLACA || dados.PLACA_CARRETA_ENTRADA))) throw Error('Linha sem documento ou placa: ' + tipo)
      const assinatura = canonicalHash(dados)
      if (!seen.has(assinatura)) { seen.add(assinatura); rows.push({ dados, assinatura }) }
    }
    return { tipo, rows }
  })
}
async function obtainReports(window) {
  const endpoint = new URL(process.env.LOGAN_COLLECTOR_URL)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash)
    throw Error('Endereço inseguro do coletor Logan')
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: {
      Authorization: 'Bearer ' + process.env.LOGAN_COLLECTOR_TOKEN,
      Accept: 'application/json', 'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...window, reports: TYPES.map(([tipo]) => tipo) }),
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) {
    const e = Error(response.status === 401 || response.status === 403
      ? 'O coletor precisa de nova autorização Microsoft no Logan.'
      : 'Não foi possível exportar os relatórios pelo coletor autorizado.')
    e.status = 502
    throw e
  }
  const raw = await response.text()
  if (raw.length > 30000000) throw Error('Exportação Logan excede o tamanho permitido')
  return validateCollectorPayload(JSON.parse(raw))
}
async function persist(tx, snapshots, window) {
  const acquired = await tx`SELECT pg_try_advisory_xact_lock(467184821) AS locked`
  if (!acquired[0]?.locked) {
    const e = Error('Outra sincronização já está em andamento.')
    e.status = 409
    throw e
  }
  const tables = await tx`SELECT to_regclass('public.logan_importacoes') AS a, to_regclass('public.logan_registros') AS b`
  if (!tables[0]?.a || !tables[0]?.b) throw Error('Tabelas Logan indisponíveis')
  const result = { inseridos: 0, ignorados: 0, relatorios: {} }
  for (const report of snapshots) {
    const signatures = report.rows.map(r => r.assinatura)
    const documentField = report.tipo === 'entradas_saidas' ? 'DT_ENTRADA' : 'DOCUMENTO_DE_TRANSPORTE'
    const documents = [...new Set(report.rows.map(r => r.dados[documentField]))]
    // Verify actual JSONB equality because older CSV hashes depended on column order.
    const matches = documents.length ? await tx`SELECT dados FROM logan_registros
       WHERE tipo = ${report.tipo} AND dados ->> ${documentField} = ANY(${documents})` : []
    const known = new Set(matches.map(r => canonicalHash(r.dados)))
    const newRows = report.rows.filter(r => !known.has(r.assinatura))
    const ignored = report.rows.length - newRows.length
    result.ignorados += ignored
    result.relatorios[report.tipo] = { recebidos: report.rows.length, novos: newRows.length, repetidos: ignored }
    if (!newRows.length) continue
    const fileHash = sha(signatures.slice().sort().join('|'))
    const filename = 'logan-' + window.dateFrom + '-a-' + window.dateTo + '.json'
    const imports = await tx`INSERT INTO logan_importacoes(tipo, arquivo, arquivo_sha256, linhas)
      VALUES (${report.tipo}, ${filename}, ${fileHash}, ${report.rows.length})
      ON CONFLICT (tipo, arquivo_sha256) DO NOTHING RETURNING id`
    if (!imports.length) {
      result.ignorados += newRows.length
      result.relatorios[report.tipo].novos = 0
      result.relatorios[report.tipo].repetidos = report.rows.length
      continue
    }
    for (let i = 0; i < newRows.length; i++) {
      const row = newRows[i]
      await tx`INSERT INTO logan_registros(importacao_id, tipo, linha_numero, assinatura_linha, dados)
        VALUES (${imports[0].id}, ${report.tipo}, ${i + 2}, ${row.assinatura}, ${tx.json(row.dados)})`
      result.inseridos++
    }
  }
  return result
}
export async function synchronizeLogan({ now = new Date() } = {}) {
  if (!collectorConfigured()) {
    const e = Error('A captura autenticada do Logan ainda não está configurada. Nenhum relatório novo foi buscado.')
    e.status = 424
    throw e
  }
  if (collecting) {
    const e = Error('Sincronização já em andamento.')
    e.status = 409
    throw e
  }
  collecting = true
  try {
    const window = reportWindow(now)
    const snapshots = await obtainReports(window)
    const saved = await withTransaction(tx => persist(tx, snapshots, window))
    return { ...saved, periodo: window, executadaEm: new Date().toISOString() }
  } finally {
    collecting = false
  }
}
