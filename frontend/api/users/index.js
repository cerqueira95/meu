import bcrypt from 'bcryptjs'
import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

const PROFILES = ['ADM', 'Operador', 'Ajudante', 'Conferente']
const STATUSES = ['ativo', 'inativo']
const MAX_PROFILE_IMAGE_LENGTH = 700_000

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT
          id,
          nome,
          cpf,
          matricula,
          email,
          cargo,
          turno,
          perfil,
          status,
          foto_perfil,
          ultimo_login,
          criado_em
        FROM usuarios
        ORDER BY nome ASC
      `

      return res.status(200).json({
        status: 'ok',
        usuarios: rows.map(serializeUser),
      })
    } catch (error) {
      console.error('users_list_error', error)
      return res.status(500).json({
        status: 'error',
        message: 'Não foi possível carregar os usuários.',
      })
    }
  }

  if (req.method === 'POST') {
    try {
      const payload = normalizePayload(req.body)
      const validation = validatePayload(payload, true)

      if (validation) {
        return res.status(400).json({ status: 'error', message: validation })
      }

      const senhaHash = await bcrypt.hash(payload.senha, 12)

      const rows = await sql`
        INSERT INTO usuarios (
          nome,
          cpf,
          matricula,
          email,
          senha_hash,
          cargo,
          turno,
          perfil,
          status,
          alterar_senha,
          foto_perfil
        )
        VALUES (
          ${payload.nome},
          ${payload.cpf},
          ${payload.matricula},
          ${payload.email},
          ${senhaHash},
          ${payload.cargo},
          ${payload.turno},
          ${payload.perfil},
          ${payload.status},
          FALSE,
          ${payload.foto_perfil}
        )
        RETURNING
          id,
          nome,
          cpf,
          matricula,
          email,
          cargo,
          turno,
          perfil,
          status,
          foto_perfil,
          ultimo_login,
          criado_em
      `

      return res.status(201).json({
        status: 'ok',
        message: 'Funcionário cadastrado com sucesso.',
        usuario: serializeUser(rows[0]),
      })
    } catch (error) {
      if (error?.code === '23505') {
        return res.status(409).json({
          status: 'error',
          message: 'CPF, matrícula ou e-mail já cadastrado.',
        })
      }

      if (error?.message === 'INVALID_PROFILE_IMAGE') {
        return res.status(400).json({
          status: 'error',
          message: 'A foto de perfil enviada é inválida.',
        })
      }

      if (error?.message === 'PROFILE_IMAGE_TOO_LARGE') {
        return res.status(400).json({
          status: 'error',
          message: 'A foto de perfil ficou muito grande.',
        })
      }

      console.error('users_create_error', error)
      return res.status(500).json({
        status: 'error',
        message: 'Não foi possível cadastrar o funcionário.',
      })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({
    status: 'error',
    message: 'Método não permitido.',
  })
}

async function requireAdmin(req, res) {
  try {
    const usuario = await getSessionUser(req)

    if (!usuario) {
      res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
      return null
    }

    if (String(usuario.perfil || '').toUpperCase() !== 'ADM') {
      res.status(403).json({
        status: 'error',
        message: 'Apenas administradores podem gerenciar usuários.',
      })
      return null
    }

    return usuario
  } catch (error) {
    console.error('users_auth_error', error)
    res.status(500).json({
      status: 'error',
      message: 'Não foi possível validar seu acesso.',
    })
    return null
  }
}

function normalizePayload(body = {}) {
  return {
    nome: String(body.nome || '').trim(),
    cpf: onlyDigits(body.cpf),
    matricula: nullable(body.matricula),
    email: nullable(body.email)?.toLowerCase() || null,
    cargo: nullable(body.cargo),
    turno: nullable(body.turno),
    perfil: String(body.perfil || '').trim(),
    status: String(body.status || 'ativo').trim().toLowerCase(),
    senha: String(body.senha || ''),
    foto_perfil: normalizeProfileImage(body.foto_perfil),
  }
}

function validatePayload(payload, requirePassword) {
  if (payload.nome.length < 2) return 'Informe o nome do funcionário.'
  if (payload.cpf.length !== 11) return 'Informe um CPF válido.'
  if (!PROFILES.includes(payload.perfil)) return 'Selecione um perfil válido.'
  if (!STATUSES.includes(payload.status)) return 'Selecione um status válido.'
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return 'Informe um e-mail válido.'
  }
  if (requirePassword && payload.senha.length < 6) {
    return 'A senha inicial deve ter pelo menos 6 caracteres.'
  }
  return null
}

function serializeUser(usuario) {
  return {
    id: Number(usuario.id),
    nome: usuario.nome,
    cpf: usuario.cpf,
    matricula: usuario.matricula ?? null,
    email: usuario.email ?? null,
    cargo: usuario.cargo ?? null,
    turno: usuario.turno ?? null,
    perfil: usuario.perfil,
    status: usuario.status,
    foto_perfil: usuario.foto_perfil ?? null,
    ultimo_login: usuario.ultimo_login ?? null,
    criado_em: usuario.criado_em ?? null,
  }
}

function normalizeProfileImage(value) {
  const image = String(value || '').trim()
  if (!image) return null

  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image)) {
    throw new Error('INVALID_PROFILE_IMAGE')
  }

  if (image.length > MAX_PROFILE_IMAGE_LENGTH) {
    throw new Error('PROFILE_IMAGE_TOO_LARGE')
  }

  return image
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11)
}

function nullable(value) {
  const text = String(value || '').trim()
  return text || null
}