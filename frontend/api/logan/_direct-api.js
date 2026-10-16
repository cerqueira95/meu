// Direct, server-to-server Logan integration. Never uses a personal Chrome session.
// Requires service access formally provisioned for these READ-ONLY reports by Logan/Ambev.
// No credentials are logged or sent to the browser.
const REPORTS = [
  { type: 'entradas_saidas', path: '/logan/gates/v1/reports/csv-report/', cols: 62, filter: 'document', required: 'DT_ENTRADA' },
  { type: 'movimentacoes', path: '/logan/gates/v1/reports/vehicle-movements/', cols: 19, filter: 'dtDocument', required: 'DOCUMENTO_DE_TRANSPORTE' },
]
const MAX_BYTES = 25_000_000
const API_ORIGIN = 'https://logan.ambev.com.br'
let tokenCache = null

export function directApiStatus(env = process.env) {
  const missing = []
  if (env.LOGAN_DIRECT_ENABLED !== 'true') missing.push('LOGAN_DIRECT_ENABLED')
  if (!env.LOGAN_API_STRUCTURE_ID) missing.push('LOGAN_API_STRUCTURE_ID')
  if (!env.LOGAN_API_LOCATIONS) missing.push('LOGAN_API_LOCATIONS')
  const oauth = Boolean(env.LOGAN_API_TOKEN_URL && env.LOGAN_API_CLIENT_ID && env.LOGAN_API_CLIENT_SECRET)
  const bearer = Boolean(env.LOGAN_API_SERVICE_TOKEN)
  if (!oauth && !bearer) missing.push('Credencial de integração autorizada (service token ou OAuth client credentials)')
  return { enabled: missing.length === 0, missing, authentication: oauth ? 'oauth_client_credentials' : bearer ? 'service_token' : 'unconfigured' }
}

function ensureHttps(url) {
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('Endpoint HTTPS de autenticação inválido')
  if (url.hostname === 'login.microsoftonline.com' || url.hostname === 'logan.ambev.com.br' ||
      url.hostname.endsWith('.ambev.com.br')) return
  throw Error('A autenticação deve utilizar um domínio de identidade aprovado; valide o host com a TI.')
}
async function serviceToken(env, fetcher) {
  const status = directApiStatus(env)
  if (!status.enabled) throw Error('Integração direta Logan ainda não autorizada/configurada')
  if (status.authentication === 'service_token') return env.LOGAN_API_SERVICE_TOKEN
  if (tokenCache && tokenCache.key === env.LOGAN_API_CLIENT_ID && Date.now() < tokenCache.expires) return tokenCache.value
  const address = new URL(env.LOGAN_API_TOKEN_URL)
  ensureHttps(address)
  const request = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.LOGAN_API_CLIENT_ID,
    client_secret: env.LOGAN_API_CLIENT_SECRET,
  })
  if (env.LOGAN_API_SCOPE) request.set('scope', env.LOGAN_API_SCOPE)
  if (env.LOGAN_API_AUDIENCE) request.set('audience', env.LOGAN_API_AUDIENCE)
  const reply = await fetcher(address, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: request,
    signal: AbortSignal.timeout(15000),
  })
  if (!reply.ok) throw Error('O provedor de identidade rejeitou a autenticação de serviço (' + reply.status + ')')
  const auth = await reply.json()
  if (!auth?.access_token || typeof auth.access_token !== 'string') throw Error('Provedor de identidade não retornou token de serviço válido')
  const ttl = Math.min(3600, Math.max(60, Number(auth.expires_in) || 300))
  tokenCache = { key: env.LOGAN_API_CLIENT_ID, value: auth.access_token, expires: Date.now() + (ttl - 40) * 1000 }
  return auth.access_token
}

export function buildReportUrl(report, period, env = process.env) {
  const base = new URL(API_ORIGIN)
  const endpoint = new URL(report.path, base)
  endpoint.searchParams.set('structureId', String(env.LOGAN_API_STRUCTURE_ID || ''))
  endpoint.searchParams.set('locations', String(env.LOGAN_API_LOCATIONS || ''))
  endpoint.searchParams.set('_minEventTime', period.dateFrom)
  endpoint.searchParams.set('_maxEventTime', period.dateTo)
  endpoint.searchParams.set('locationTimeZone', String(env.LOGAN_API_LOCATION_TIMEZONE || 'America/Bahia'))
  endpoint.searchParams.set('plate', '')
  endpoint.searchParams.set('trailerPlate', '')
  endpoint.searchParams.set(report.filter, '')
  return endpoint
}
export function parseLoganCsv(s, report) {
  if (typeof s !== 'string' || s.length > MAX_BYTES) throw Error('Resposta de relatório excessiva ou inválida')
  let text = s.replace(/^\uFEFF/, '')
  const lines = []
  let fields = [], item = '', quoted = false
  for(let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { item += '"'; i++ }
      else if (char === '"') quoted = false
      else item += char
    } else if (char === '"' && item === '') quoted = true
    else if (char === ';') { fields.push(item); item = '' }
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      fields.push(item); item = ''
      if (fields.some(f => f.trim())) lines.push(fields)
      fields = []
    } else item += char
  }
  if (quoted) throw Error('CSV do Logan contém aspas não fechadas')
  if (fields.length || item) { fields.push(item); lines.push(fields) }
  if (!lines.length) throw Error('Relatório do Logan retornou CSV vazio')
  const [headers, ...records] = lines
  if (headers.length !== report.cols || !headers.includes(report.required) || new Set(headers).size !== headers.length)
    throw Error('Formato de colunas do Logan mudou para ' + report.type)
  if (records.length > 10000) throw Error('Limite de 10 mil linhas excedido; reduza o intervalo')
  return records.map((row, ix) => {
    if (row.length !== headers.length) throw Error('Colunas inválidas na linha ' + (ix + 2) + ' do relatório ' + report.type)
    return Object.fromEntries(headers.map((header, j) => [header, row[j].trim()]))
  })
}
export async function readServiceReports(period, { env = process.env, fetcher = fetch } = {}) {
  const token = await serviceToken(env, fetcher)
  const result = {}
  for (const report of REPORTS) {
    const address = buildReportUrl(report, period, env)
    const reply = await fetcher(address, {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: 'Bearer ' + token, Accept: 'text/csv, text/plain;q=0.9' },
      signal: AbortSignal.timeout(60000),
    })
    if (reply.status === 401 || reply.status === 403) throw Error('Credencial de API Logan sem autorização para ' + report.type + ' (' + reply.status + ')')
    if (!reply.ok) throw Error('Falha ao consultar relatório ' + report.type + ' (HTTP ' + reply.status + ')')
    const size = Number(reply.headers?.get?.('content-length') || 0)
    if (size > MAX_BYTES) throw Error('Relatório Logan muito grande; reduza o intervalo')
    const content = await reply.text()  // memory only: never write CSV to disk
    result[report.type] = parseLoganCsv(content, report)
  }
  return result
}
export const reportDefinitions = REPORTS.map(({type,path})=>({type,path}))
