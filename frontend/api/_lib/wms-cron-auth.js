import { createPublicKey, verify, timingSafeEqual } from 'node:crypto'

// GitHub Actions OIDC: short-lived, signed identity, scoped to this workflow on main.
// CRON_SECRET remains supported during migration for existing approved callers.
const ISSUER = 'https://token.actions.githubusercontent.com'
const AUDIENCE = 'warehouse-orion-wms-cron'
const REPOSITORY = 'cerqueira95/meu'
const REPOSITORY_ID = '841201999'
const WORKFLOW_REF = REPOSITORY + '/.github/workflows/rateio-cron.yml@refs/heads/main'
const JWKS_URL = ISSUER + '/.well-known/jwks'
const MAX_TOKEN_LENGTH = 12000
let cachedJwks = null

function safeEqual(a, b) {
  const first = Buffer.from(a)
  const second = Buffer.from(b)
  return first.length === second.length && timingSafeEqual(first, second)
}
function decodePart(input) {
  if (!/^[a-zA-Z0-9_-]+$/.test(input) || input.length > MAX_TOKEN_LENGTH) throw Error('Bad JWT format')
  return JSON.parse(Buffer.from(input, 'base64url').toString('utf8'))
}
function allowedClaims(claims, now) {
  if (claims.iss !== ISSUER) return false
  if (claims.aud !== AUDIENCE && !(Array.isArray(claims.aud) && claims.aud.includes(AUDIENCE))) return false
  if (claims.repository !== REPOSITORY || String(claims.repository_id) !== REPOSITORY_ID) return false
  if (claims.ref !== 'refs/heads/main' || claims.workflow_ref !== WORKFLOW_REF) return false
  if (!['schedule', 'workflow_dispatch', 'push'].includes(claims.event_name)) return false
  if (claims.sub !== 'repo:' + REPOSITORY + ':ref:refs/heads/main') return false
  const exp = Number(claims.exp), iat = Number(claims.iat), nbf = Number(claims.nbf ?? iat)
  if (![exp, iat, nbf].every(Number.isFinite)) return false
  // A limited clock-skew allowance plus a maximum JWT age bounds replay.
  if (now > exp + 30 || now < nbf - 30 || iat > now + 30 || iat < now - 600) return false
  return true
}
async function loadJwks(fetcher, nowMs, refresh = false) {
  if (!refresh && cachedJwks && cachedJwks.until > nowMs) return cachedJwks.keys
  const response = await fetcher(JWKS_URL, {
    method: 'GET',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  })
  if (!response.ok) throw Error('GitHub identity keys unavailable')
  const text = await response.text()
  if (text.length > 150000) throw Error('GitHub identity keys too large')
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed.keys) || parsed.keys.length > 30) throw Error('Unexpected GitHub identity keys')
  cachedJwks = { keys: parsed.keys, until: nowMs + 10 * 60 * 1000 }
  return parsed.keys
}
export async function isAuthorizedWmsCron(req, { env = process.env, fetcher = fetch, nowMs = Date.now() } = {}) {
  const auth = String(req?.headers?.authorization || '')
  const match = /^Bearer ([^\s]+)$/i.exec(auth)
  if (!match || match[1].length > MAX_TOKEN_LENGTH) return false
  const token = match[1]
  const secret = String(env.CRON_SECRET || '')
  if (secret && safeEqual(token, secret)) return true
  const chunks = token.split('.')
  if (chunks.length !== 3) return false
  try {
    const header = decodePart(chunks[0])
    const claims = decodePart(chunks[1])
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 150) return false
    const now = Math.floor(nowMs / 1000)
    if (!allowedClaims(claims, now)) return false
    let keys = await loadJwks(fetcher, nowMs)
    let jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256'))
    if (!jwk) {
      keys = await loadJwks(fetcher, nowMs, true)
      jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256'))
    }
    if (!jwk) return false
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' })
    return verify('RSA-SHA256', Buffer.from(chunks[0] + '.' + chunks[1]), publicKey, Buffer.from(chunks[2], 'base64url'))
  } catch {
    return false
  }
}
export const GITHUB_CRON_AUDIENCE = AUDIENCE
