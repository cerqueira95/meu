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
  const emailOwners = new Map()
  const matriculaOwners = new Map()
  const wmsIdOwners = new Map()
  const wmsLoginOwners = new Map()

  for (const row of rows || []) {
    const cpf = String(row.cpf || '')
    byCpf.set(cpf, Number(row.id))

    if (row.email) emailOwners.set(String(row.email).toLowerCase(), cpf)
    if (row.matricula) matriculaOwners.set(String(row.matricula), cpf)
    if (row.wms_usuario_id) wmsIdOwners.set(String(row.wms_usuario_id), cpf)
    if (row.wms_login) wmsLoginOwners.set(String(row.wms_login).toLowerCase(), cpf)
  }

  return {
    byCpf,
    emailOwners,
    matriculaOwners,
    wmsIdOwners,
    wmsLoginOwners,
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

  const target = await getTargetUsers()

  const payload = legacyUsers.map((row) => {
    const cpf = String(row.cpf || '')

    const email =
      row.email &&
      (!target.emailOwners.has(String(row.email).toLowerCase()) ||
        target.emailOwners.get(String(row.email).toLowerCase()) === cpf)
        ? row.email
        : null

    const matricula =
      row.matricula &&
      (!target.matriculaOwners.has(String(row.matricula)) ||
        target.matriculaOwners.get(String(row.matricula)) === cpf)
        ? row.matricula
        : null

    const wmsUsuarioId =
      row.wms_usuario_id &&
      (!target.wmsIdOwners.has(String(row.wms_usuario_id)) ||
        target.wmsIdOwners.get(String(row.wms_usuario_id)) === cpf)
        ? row.wms_usuario_id
        : null

    const wmsLogin =
      row.wms_login &&
      (!target.wmsLoginOwners.has(String(row.wms_login).toLowerCase()) ||
        target.wmsLoginOwners.get(String(row.wms_login).toLowerCase()) === cpf)
        ? row.wms_login
        : null

    return {
      nome: row.nome,
      cpf: row.cpf,
      matricula,
      email,
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
      wms_usuario_id: wmsUsuarioId,
      wms_login: wmsLogin,
      origem: row.origem || 'local',
      criado_em: row.criado_em,
      atualizado_em: row.atualizado_em,
    }
  })

  await targetRest('usuarios?on_conflict=cpf', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  })

  return payload.length
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

async function loadSourceBatch(source, table, afterId, limit) {
  if (!COPY_TABLES.has(table)) throw new Error('Tabela não permitida.')

  if (table === 'login_logs') {
    return source`
      SELECT l.*, u.cpf AS _usuario_cpf
      FROM login_logs l
      LEFT JOIN usuarios u ON u.id = l.usuario_id
      WHERE l.id > ${afterId}
      ORDER BY l.id
      LIMIT ${limit}
    `
  }

  if (table === 'sessoes') {
    return source`
      SELECT s.*, u.cpf AS _usuario_cpf
      FROM sessoes s
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id > ${afterId}
      ORDER BY s.id
      LIMIT ${limit}
    `
  }

  if (table === 'acessos_rapidos') {
    return source`
      SELECT a.*, u.cpf AS _usuario_cpf
      FROM acessos_rapidos a
      JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.id > ${afterId}
      ORDER BY a.id
      LIMIT ${limit}
    `
  }

  if (table === 'armazem_publicacoes') {
    return source`
      SELECT p.*, u.cpf AS _autor_cpf
      FROM armazem_publicacoes p
      JOIN usuarios u ON u.id = p.autor_id
      WHERE p.id > ${afterId}
      ORDER BY p.id
      LIMIT ${limit}
    `
  }

  if (table === 'armazem_comentarios') {
    return source`
      SELECT c.*, u.cpf AS _usuario_cpf
      FROM armazem_comentarios c
      JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.id > ${afterId}
      ORDER BY c.id
      LIMIT ${limit}
    `
  }

  if (table === 'armazem_reacoes') {
    return source`
      SELECT r.*, u.cpf AS _usuario_cpf
      FROM armazem_reacoes r
      JOIN usuarios u ON u.id = r.usuario_id
      WHERE r.id > ${afterId}
      ORDER BY r.id
      LIMIT ${limit}
    `
  }

  if (table === 'escalonada_resultados') {
    return source`
      SELECT e.*, u.cpf AS _usuario_cpf
      FROM escalonada_resultados e
      LEFT JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.id > ${afterId}
      ORDER BY e.id
      LIMIT ${limit}
    `
  }

  if (table === 'escalonada_notificacoes') {
    return source`
      SELECT n.*, u.cpf AS _usuario_cpf
      FROM escalonada_notificacoes n
      JOIN usuarios u ON u.id = n.usuario_id
      WHERE n.id > ${afterId}
      ORDER BY n.id
      LIMIT ${limit}
    `
  }

  return source.unsafe(
    `SELECT * FROM public."${table.replaceAll('"', '""')}" WHERE id > $1 ORDER BY id LIMIT $2`,
    [afterId, limit],
  )
}

async function transformUserReferences(rows) {
  const target = await getTargetUsers()

  return rows.map((raw) => {
    const row = { ...raw }

    if (Object.hasOwn(row, '_usuario_cpf')) {
      const cpf = String(row._usuario_cpf || '')
      delete row._usuario_cpf

      if (!cpf) {
        row.usuario_id = null
      } else {
        const targetId = target.byCpf.get(cpf)
        if (!targetId) throw new Error(`Usuário destino não encontrado para CPF ${cpf}`)
        row.usuario_id = targetId
      }
    }

    if (Object.hasOwn(row, '_autor_cpf')) {
      const cpf = String(row._autor_cpf || '')
      delete row._autor_cpf

      const targetId = target.byCpf.get(cpf)
      if (!targetId) throw new Error(`Autor destino não encontrado para CPF ${cpf}`)
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
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  }

  const migrationSecret = process.env.MIGRATION_SECRET || ''

  if (!migrationSecret || !safeEqual(req.query?.token, migrationSecret)) {
    return res.status(401).json({ status: 'error', message: 'Não autorizado.' })
  }

  const sourceUrl = legacyUrl()
  if (!sourceUrl) {
    return res.status(500).json({ status: 'error', message: 'Banco legado não configurado.' })
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
      const afterId = Math.max(0, Number(req.query?.after_id || 0) || 0)
      const limit = Math.min(
        10000,
        Math.max(1, Number(req.query?.limit || 5000) || 5000),
      )

      const result = await copyBatch(source, table, afterId, limit)
      return res.status(200).json({
        status: 'ok',
        action,
        table,
        ...result,
      })
    }

    return res.status(400).json({ status: 'error', message: 'Ação inválida.' })
  } catch (error) {
    console.error('migration_to_supabase_error', error)

    return res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Erro de migração.',
    })
  } finally {
    await source.end({ timeout: 5 })
  }
}
