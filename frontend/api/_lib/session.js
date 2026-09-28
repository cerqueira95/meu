import crypto from 'node:crypto'
import { sql } from './db.js'

const COOKIE_NAME = 'warehouse_session'
const SESSION_HOURS = 12
const QUICK_ACCESS_DAYS = 180

export function getCookie(req, name = COOKIE_NAME) {
  const cookieHeader = req.headers.cookie || ''
  const cookies = cookieHeader.split(';')

  for (const item of cookies) {
    const [key, ...rest] = item.trim().split('=')

    if (key === name) {
      return decodeURIComponent(rest.join('='))
    }
  }

  return null
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createSession(usuarioId, req, res) {
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000)
  const ip = getClientIp(req)
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500)

  await sql`
    INSERT INTO sessoes (
      usuario_id,
      token_hash,
      ip,
      user_agent,
      expira_em
    )
    VALUES (
      ${usuarioId},
      ${tokenHash},
      ${ip},
      ${userAgent},
      ${expiresAt.toISOString()}
    )
  `

  res.setHeader('Set-Cookie', serializeSessionCookie(token, expiresAt))
}

export async function createQuickAccess(usuarioId, req) {
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(
    Date.now() + QUICK_ACCESS_DAYS * 24 * 60 * 60 * 1000,
  )
  const ip = getClientIp(req)
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500)

  await sql`
    DELETE FROM acessos_rapidos
    WHERE usuario_id = ${usuarioId}
      AND expira_em <= NOW()
  `

  await sql`
    INSERT INTO acessos_rapidos (
      usuario_id,
      token_hash,
      user_agent,
      ip,
      expira_em
    )
    VALUES (
      ${usuarioId},
      ${tokenHash},
      ${userAgent},
      ${ip},
      ${expiresAt.toISOString()}
    )
  `

  return {
    token,
    expiresAt: expiresAt.toISOString(),
  }
}

export async function getQuickAccessUser(token, req) {
  const tokenHash = hashToken(String(token || ''))

  const rows = await sql`
    SELECT
      u.id,
      u.nome,
      u.cpf,
      u.matricula,
      u.email,
      u.cargo,
      u.turno,
      u.perfil,
      u.status,
      u.alterar_senha,
      a.id AS acesso_id
    FROM acessos_rapidos a
    INNER JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.token_hash = ${tokenHash}
      AND a.expira_em > NOW()
      AND a.revogado_em IS NULL
      AND u.status = 'ativo'
    LIMIT 1
  `

  const usuario = rows[0]

  if (!usuario) {
    return null
  }

  const renewedUntil = new Date(
    Date.now() + QUICK_ACCESS_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const ip = getClientIp(req)
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500)

  await sql`
    UPDATE acessos_rapidos
    SET ultimo_uso_em = NOW(),
        expira_em = ${renewedUntil},
        ip = ${ip},
        user_agent = ${userAgent}
    WHERE id = ${usuario.acesso_id}
  `

  return publicUser(usuario)
}

export async function destroySession(req, res) {
  const token = getCookie(req)

  if (token) {
    await sql`
      DELETE FROM sessoes
      WHERE token_hash = ${hashToken(token)}
    `
  }

  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  )
}

export async function getSessionUser(req) {
  const token = getCookie(req)

  if (!token) {
    return null
  }

  const rows = await sql`
    SELECT
      u.id,
      u.nome,
      u.cpf,
      u.matricula,
      u.email,
      u.cargo,
      u.turno,
      u.perfil,
      u.status,
      u.alterar_senha,
      s.id AS sessao_id
    FROM sessoes s
    INNER JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.expira_em > NOW()
      AND u.status = 'ativo'
    LIMIT 1
  `

  const usuario = rows[0]

  if (!usuario) {
    return null
  }

  await sql`
    UPDATE sessoes
    SET ultimo_uso_em = NOW()
    WHERE id = ${usuario.sessao_id}
  `

  return publicUser(usuario)
}

export function publicUser(usuario) {
  return {
    id: Number(usuario.id),
    nome: usuario.nome,
    cpf: maskCpf(usuario.cpf),
    matricula: usuario.matricula ?? null,
    email: usuario.email ?? null,
    cargo: usuario.cargo ?? null,
    turno: usuario.turno ?? null,
    perfil: usuario.perfil ?? 'usuario',
    alterar_senha: Boolean(usuario.alterar_senha),
  }
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }

  return req.socket?.remoteAddress || null
}

function serializeSessionCookie(token, expiresAt) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${SESSION_HOURS * 60 * 60}`,
  ].join('; ')
}

function maskCpf(cpf) {
  const value = String(cpf || '')

  if (value.length !== 11) {
    return value
  }

  return `${value.slice(0, 3)}.***.***-${value.slice(-2)}`
}
