import crypto from 'node:crypto'
import { sql } from './db.js'

const CONFIG_KEY = 'wms_credentials_v1'
const CIPHER = 'aes-256-gcm'

function keyBuffer() {
  const raw = String(process.env.WMS_CREDENTIALS_KEY || '').trim()
  if (!raw) throw new Error('WMS_CREDENTIALS_KEY_MISSING')

  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('WMS_CREDENTIALS_KEY_INVALID')

  return key
}

function encrypt(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(CIPHER, keyBuffer(), iv)
  const encrypted = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final(),
  ])

  return {
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: encrypted.toString('base64url'),
  }
}

function decrypt(payload) {
  const decipher = crypto.createDecipheriv(
    CIPHER,
    keyBuffer(),
    Buffer.from(payload.iv, 'base64url'),
  )

  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export async function saveWmsCredentials({ username, password, adminId }) {
  const record = JSON.stringify({
    version: 1,
    username: encrypt(username),
    password: encrypt(password),
    updatedBy: Number(adminId),
  })

  await sql`
    INSERT INTO configuracoes (chave, valor, descricao, atualizado_em)
    VALUES (
      ${CONFIG_KEY},
      ${record},
      'Credenciais WMS criptografadas no servidor',
      NOW()
    )
    ON CONFLICT (chave)
    DO UPDATE SET valor = EXCLUDED.valor,
                  descricao = EXCLUDED.descricao,
                  atualizado_em = NOW()
  `
}

export async function readWmsCredentials() {
  const rows = await sql`
    SELECT valor, atualizado_em
    FROM configuracoes
    WHERE chave = ${CONFIG_KEY}
    LIMIT 1
  `

  const row = rows[0]
  if (!row?.valor) return null

  const parsed = JSON.parse(row.valor)

  return {
    username: decrypt(parsed.username),
    password: decrypt(parsed.password),
    updatedAt: row.atualizado_em,
    updatedBy: parsed.updatedBy ?? null,
  }
}

export async function getWmsCredentialStatus() {
  const rows = await sql`
    SELECT valor, atualizado_em
    FROM configuracoes
    WHERE chave = ${CONFIG_KEY}
    LIMIT 1
  `

  const row = rows[0]
  if (!row?.valor) {
    return {
      configured: false,
      maskedUsername: null,
      updatedAt: null,
    }
  }

  const parsed = JSON.parse(row.valor)
  const username = decrypt(parsed.username)

  return {
    configured: true,
    maskedUsername: maskLogin(username),
    updatedAt: row.atualizado_em,
  }
}

export async function saveWmsIntegrationStatus(status) {
  const value = JSON.stringify({
    status: status?.status || 'unknown',
    message: status?.message || null,
    checkedAt: status?.checkedAt || new Date().toISOString(),
    count: Number(status?.count || 0),
  })

  await sql`
    INSERT INTO configuracoes (chave, valor, descricao, atualizado_em)
    VALUES (
      'wms_integration_status_v1',
      ${value},
      'Último status conhecido da integração WMS',
      NOW()
    )
    ON CONFLICT (chave)
    DO UPDATE SET valor = EXCLUDED.valor,
                  descricao = EXCLUDED.descricao,
                  atualizado_em = NOW()
  `
}

export async function readWmsIntegrationStatus() {
  const rows = await sql`
    SELECT valor
    FROM configuracoes
    WHERE chave = 'wms_integration_status_v1'
    LIMIT 1
  `

  if (!rows[0]?.valor) return null

  try {
    return JSON.parse(rows[0].valor)
  } catch {
    return null
  }
}

function maskLogin(value) {
  const text = String(value || '').trim()
  if (!text) return ''

  if (text.length <= 4) {
    return `${text.charAt(0)}***`
  }

  const visibleStart = Math.min(3, Math.max(1, Math.floor(text.length / 4)))
  const visibleEnd = Math.min(2, Math.max(1, Math.floor(text.length / 5)))

  return `${text.slice(0, visibleStart)}••••••${text.slice(-visibleEnd)}`
}
