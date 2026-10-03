import crypto from 'node:crypto'
import postgres from 'postgres'

const RESET_TABLES = [
  'escalonada_notificacoes',
  'escalonada_resultados',
  'wms_item_registros',
  'wms_item_coletas',
  'wms_rateio_registros',
  'wms_rateio_coletas',
  'armazem_reacoes',
  'armazem_comentarios',
  'armazem_publicacoes',
  'login_logs',
  'sessoes',
  'acessos_rapidos',
]

const COPY_TABLES = new Set(RESET_TABLES)

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))

  if (a.length !== b.length || a.length === 0) return false
  return crypto.timingSafeEqual(a, b)
}

function clean(value) {
  return String(value || '').trim()
}

function cleanLower(value) {
  return clean(value).toLowerCase()
}

function legacyUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ''
  )
}

function supabaseConfig() {
  return {
    url: String(process.env.SUPABASE_API_URL || '').replace(/\/$/, ''),
    key: String(process.env.SUPABASE_ANON_KEY || ''),
    token: String(process.env.MIGRATION_SECRET || ''),
  }
}

async function targetRest(path, init = {}) {
  const { url, key, token } = supabaseConfig()

  if (!url || !key || !token) {
    throw new Error('Configuração do Supabase incompleta.')
  }

  const headers = new Headers(init.headers || {})
  headers.set('apikey', key)
  headers.set('authorization', `Bearer ${key}`)
  headers.set('x-migration-token', token)

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers,
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${text.slice(0, 1000)}`,
    )
  }

  return text ? JSON.parse(text) : null
}

async function getTargetUsers() {
  const rows = await targetRest(
    'usuarios?select=id,cpf,email,matricula,wms_usuario_id,wms_login',
  )

  const byCpf = new Map()
  const byWmsId = new Map()
  const byWmsLogin = new Map()
  const emailOwners = new Map()
  const matriculaOwners = new Map()
  const wmsIdOwners = new Map()
  const wmsLoginOwners = new Map()

  for (const row of rows || []) {
    const id = Number(row.id)
    const cpf = clean(row.cpf)
    const wmsId = clean(row.wms_usuario_id)
    const wmsLogin = cleanLower(row.wms_login)

    if (cpf) byCpf.set(cpf, id)
    if (wmsId) byWmsId.set(wmsId, id)
    if (wmsLogin) byWmsLogin.set(wmsLogin, id)
    if (row.email) emailOwners.set(cleanLower(row.email), id)
    if (row.matricula) matriculaOwners.set(clean(row.matricula), id)
    if (wmsId) wmsIdOwners.set(wmsId, id)
    if (wmsLogin) wmsLoginOwners.set(wmsLogin, id)
  }

  return {
    byCpf,
    byWmsId,
    byWmsLogin,
    emailOwners,
    matriculaOwners,
    wmsIdOwners,
    wmsLoginOwners,
  }
}

function findExistingTargetUser(target, row) {
  const cpf = clean(row.cpf)
  const wmsId = clean(row.wms_usuario_id)
  const wmsLogin = cleanLower(row.wms_login)

  if (cpf && target.byCpf.has(cpf)) return target.byCpf.get(cpf)
  if (wmsId && target.byWmsId.has(wmsId)) return target.byWmsId.get(wmsId)
  if (wmsLogin && target.byWmsLogin.has(wmsLogin)) {
    return target.byWmsLogin.get(wmsLogin)
  }

  return null
}

function buildUserPayload(row, target, existingId = null) {
  const cpf = clean(row.cpf)
  const email = cleanLower(row.email)
  const matricula = clean(row.matricula)
  const wmsId = clean(row.wms_usuario_id)
  const wmsLoginKey = cleanLower(row.wms_login)

  const emailValue =
    row.email &&
    (!target.emailOwners.has(email) ||
      target.emailOwners.get(email) === existingId)
      ? row.email
      : null

  const matriculaValue =
    row.matricula &&
    (!target.matriculaOwners.has(matricula) ||
      target.matriculaOwners.get(matricula) === existingId)
      ? row.matricula
      : null

  const wmsIdValue =
    row.wms_usuario_id &&
    (!target.wmsIdOwners.has(wmsId) ||
      target.wmsIdOwners.get(wmsId) === existingId)
      ? row.wms_usuario_id
      : null

  const wmsLoginValue =
    row.wms_login &&
    (!target.wmsLoginOwners.has(wmsLoginKey) ||
      target.wmsLoginOwners.get(wmsLoginKey) === existingId)
      ? row.wms_login
      : null

  return {
    nome: row.nome,
    cpf: cpf || null,
    matricula: matriculaValue,
    email: emailValue,
    senha_hash: row.senha_hash,
    cargo: row.cargo,
    turno: row.turno,
    perfil: row.perfil,
    status: row.status,
    alterar_senha: row.alterar_senha,
    foto_perfil: row.foto_perfil,
    noticias_lidas_ate: row.noticias_lidas_ate,
    tentativas_login: row.tentativas_login,
    bloqueado_ate: row.bloqueado_ate,
    ultimo_login: row.ultimo_login,
    ultimo_ip: row.ultimo_ip,
    wms_usuario_id: wmsIdValue,
    wms_login: wmsLoginValue,
    origem: row.origem || 'local',
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  }
}

async function migrateUsers(source) {
  const legacyUsers = await source`
    SELECT
      nome, cpf, matricula, email, senha_hash, cargo, turno, perfil, status,
      alterar_senha, foto_perfil, noticias_lidas_ate, tentativas_login,
      bloqueado_ate, ultimo_login, ultimo_ip, wms_usuario_id, wms_login,
      origem, criado_em, atualizado_em
    FROM usuarios
    ORDER BY id
  `

  let target = await getTargetUsers()
  const withCpf = []
  const withoutCpf = []

  for (const row of legacyUsers) {
    const existingId = findExistingTargetUser(target, row)
    const payload = buildUserPayload(row, target, existingId)

    if (payload.cpf) {
      withCpf.push(payload)
    } else {
      withoutCpf.push({ payload, existingId })
    }
  }

  if (withCpf.length) {
    await targetRest('usuarios?on_conflict=cpf', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(withCpf),
    })
  }

  target = await getTargetUsers()

  for (const item of withoutCpf) {
    const existingId =
      item.existingId ||
      (item.payload.wms_usuario_id
        ? target.byWmsId.get(clean(item.payload.wms_usuario_id))
        : null) ||
      (item.payload.wms_login
        ? target.byWmsLogin.get(cleanLower(item.payload.wms_login))
        : null)

    if (existingId) {
      await targetRest(`usuarios?id=eq.${existingId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(item.payload),
      })
    } else {
      await targetRest('usuarios', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(item.payload),
      })
    }
  }

  return legacyUsers.length
}

async function migrateConfiguracoes(source) {
  const rows = await source`
    SELECT chave, valor, atualizado_em
    FROM configuracoes
    ORDER BY chave
  `

  await targetRest('configuracoes?on_conflict=chave', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })

  return rows.length
}

async function prepareTarget() {
  for (const table of RESET_TABLES) {
    await targetRest(`${table}?id=gte.0`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  }
}

function userIdentitySelect(alias, prefix) {
  return `
    ${alias}.cpf AS _${prefix}_cpf,
    ${alias}.wms_usuario_id AS _${prefix}_wms_id,
    ${alias}.wms_login AS _${prefix}_wms_login
  `
}

async function loadSourceBatch(source, table, afterId, limit) {
  if (!COPY_TABLES.has(table)) throw new Error('Tabela não permitida.')

  if (table === 'login_logs') {
    return source.unsafe(
      `SELECT l.*, ${userIdentitySelect('u', 'usuario')}
       FROM login_logs l
       LEFT JOIN usuarios u ON u.id = l.usuario_id
       WHERE l.id > $1
       ORDER BY l.id
       LIMIT $2`,
      [afterId, limit],
    )
  }

  if (table === 'sessoes') {
    return source.unsafe(
      `SELECT s.*, ${userIdentitySelect('u', 'usuario')}
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.id > $1
       ORDER BY s.id
       LIMIT $2`,
      [afterId, limit],
    )
  }

  if (table === 'acessos_rapidos') {
    return source.unsafe(
      `SELECT a.*, ${userIdentitySelect('u', 'usuario')}
       FROM acessos_rapidos a
       JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.id > $1
       ORDER BY a.id
       LIMIT $2`,
      [afterId, limit],
    )
  }

  if (table === 'armazem_publicacoes') {
    return source.unsafe(
      `SELECT p.*, ${userIdentitySelect('u', 'autor')}
       FROM armazem_publicacoes p
       JOIN usuarios u ON u.id = p.autor_id
       WHERE p.id > $1
       ORDER BY p.id
       LIMIT $2`,
      [afterId, limit],
    )
  }

  if (table === 'armazem_comentarios') {
    return source.unsafe(
      `SELECT c.*, ${userIdentitySelect('u', 'usuario')}
       FROM armazem_comentarios c
       JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.id > $1
       ORDER BY c.id
       LIMIT $2`,
      [afterId, limit],
    )
  }

  if (table === 'armazem_reacoes') {
    return source.unsafe(
      `SELECT r.*, ${userIdentitySelect('u', 'usuario')}
       FROM armazem_reacoes r
       JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.id > $1
       ORDER BY r.id
       LIMIT $2`,
      [afterId, limit],
    )
  }

  if (table === 'escalonada_resultados') {
    return source.unsafe(
      `SELECT e.*, ${userIdentitySelect('u', 'usuario')}
       FROM escalonada_resultados e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       WHERE e.id > $1
       ORDER BY e.id
       LIMIT $2`,
      [afterId, limit],
    )
  }

  if (table === 'escalonada_notificacoes') {
    return source.unsafe(
      `SELECT n.*, ${userIdentitySelect('u', 'usuario')}
       FROM escalonada_notificacoes n
       JOIN usuarios u ON u.id = n.usuario_id
       WHERE n.id > $1
       ORDER BY n.id
       LIMIT $2`,
      [afterId, limit],
    )
  }

  return source.unsafe(
    `SELECT * FROM public."${table.replaceAll('"', '""')}" WHERE id > $1 ORDER BY id LIMIT $2`,
    [afterId, limit],
  )
}

function resolveTargetUserId(target, row, prefix) {
  const cpfKey = `_${prefix}_cpf`
  const wmsIdKey = `_${prefix}_wms_id`
  const wmsLoginKey = `_${prefix}_wms_login`

  const cpf = clean(row[cpfKey])
  const wmsId = clean(row[wmsIdKey])
  const wmsLogin = cleanLower(row[wmsLoginKey])

  delete row[cpfKey]
  delete row[wmsIdKey]
  delete row[wmsLoginKey]

  if (cpf && target.byCpf.has(cpf)) return target.byCpf.get(cpf)
  if (wmsId && target.byWmsId.has(wmsId)) return target.byWmsId.get(wmsId)
  if (wmsLogin && target.byWmsLogin.has(wmsLogin)) {
    return target.byWmsLogin.get(wmsLogin)
  }

  return null
}

async function transformUserReferences(rows) {
  const target = await getTargetUsers()

  return rows.map((raw) => {
    const row = { ...raw }

    if (Object.hasOwn(row, '_usuario_cpf')) {
      const originalUserId = row.usuario_id
      const targetId = resolveTargetUserId(target, row, 'usuario')

      if (originalUserId != null && !targetId) {
        throw new Error('Usuário destino não encontrado por CPF/WMS.')
      }

      row.usuario_id = targetId
    }

    if (Object.hasOwn(row, '_autor_cpf')) {
      const targetId = resolveTargetUserId(target, row, 'autor')

      if (!targetId) {
        throw new Error('Autor destino não encontrado por CPF/WMS.')
      }

      row.autor_id = targetId
    }

    return row
  })
}

async function copyBatch(source, table, afterId, limit) {
  const rows = await loadSourceBatch(source, table, afterId, limit)

  if (!rows.length) {
    return { copied: 0, lastId: afterId, done: true }
  }

  const payload = await transformUserReferences(rows)

  await targetRest(`${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  })

  const lastId = Number(rows.at(-1)?.id || afterId)

  return {
    copied: rows.length,
    lastId,
    done: rows.length < limit,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  const migrationSecret = process.env.MIGRATION_SECRET || ''

  if (!migrationSecret || !safeEqual(req.query?.token, migrationSecret)) {
    return res.status(401).json({
      status: 'error',
      message: 'Não autorizado.',
    })
  }

  const sourceUrl = legacyUrl()

  if (!sourceUrl) {
    return res.status(500).json({
      status: 'error',
      message: 'Banco legado não configurado.',
    })
  }

  const action = String(req.query?.action || '')
  const source = postgres(sourceUrl, {
    max: 1,
    prepare: false,
    ssl: 'require',
    connect_timeout: 15,
    idle_timeout: 20,
  })

  try {
    if (action === 'ping') {
      const rows = await source`SELECT NOW() AS now`
      const target = await targetRest('usuarios?select=id&limit=1')

      return res.status(200).json({
        status: 'ok',
        legacy: Boolean(rows[0]?.now),
        supabase: Array.isArray(target),
      })
    }

    if (action === 'prepare') {
      await prepareTarget()
      return res.status(200).json({ status: 'ok', action })
    }

    if (action === 'users-check') {
      const rows = await source`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (
            WHERE BTRIM(COALESCE(cpf, '')) = ''
          )::bigint AS cpf_empty,
          COUNT(*) FILTER (
            WHERE BTRIM(COALESCE(cpf, '')) = ''
              AND BTRIM(COALESCE(wms_usuario_id, '')) = ''
              AND BTRIM(COALESCE(wms_login, '')) = ''
          )::bigint AS sem_identificador
        FROM usuarios
      `

      return res.status(200).json({
        status: 'ok',
        action,
        total: Number(rows[0]?.total || 0),
        cpfEmpty: Number(rows[0]?.cpf_empty || 0),
        semIdentificador: Number(rows[0]?.sem_identificador || 0),
      })
    }

    if (action === 'users') {
      const copied = await migrateUsers(source)
      return res.status(200).json({ status: 'ok', action, copied })
    }

    if (action === 'configuracoes') {
      const copied = await migrateConfiguracoes(source)
      return res.status(200).json({ status: 'ok', action, copied })
    }

    if (action === 'copy') {
      const table = String(req.query?.table || '')
      const afterId = Math.max(
        0,
        Number(req.query?.after_id || 0) || 0,
      )
      const limit = Math.min(
        10000,
        Math.max(1, Number(req.query?.limit || 5000) || 5000),
      )

      const result = await copyBatch(
        source,
        table,
        afterId,
        limit,
      )

      return res.status(200).json({
        status: 'ok',
        action,
        table,
        ...result,
      })
    }

    return res.status(400).json({
      status: 'error',
      message: 'Ação inválida.',
    })
  } catch (error) {
    console.error('migration_to_supabase_error', error)

    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Erro de migração.',
    })
  } finally {
    await source.end({ timeout: 5 })
  }
}
