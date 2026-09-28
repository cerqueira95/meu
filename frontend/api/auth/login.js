import bcrypt from 'bcryptjs'
import { sql } from '../_lib/db.js'
import {
  createQuickAccess,
  createSession,
  getClientIp,
  publicUser,
} from '../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  try {
    const cpf = onlyDigits(req.body?.cpf)
    const senha = String(req.body?.senha || '')

    if (cpf.length !== 11 || senha.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Informe um CPF válido e sua senha.',
      })
    }

    const rows = await sql`
      SELECT *
      FROM usuarios
      WHERE cpf = ${cpf}
      LIMIT 1
    `

    const usuario = rows[0]

    if (!usuario) {
      await logAttempt(null, cpf, false, 'CPF_NAO_ENCONTRADO', req)

      return res.status(401).json({
        status: 'error',
        message: 'CPF ou senha inválidos.',
      })
    }

    if (usuario.status === 'inativo') {
      await logAttempt(usuario.id, cpf, false, 'USUARIO_INATIVO', req)

      return res.status(403).json({
        status: 'error',
        message: 'Seu acesso está inativo. Procure seu responsável.',
      })
    }

    if (usuario.status === 'bloqueado') {
      await logAttempt(usuario.id, cpf, false, 'USUARIO_BLOQUEADO', req)

      return res.status(403).json({
        status: 'error',
        message: 'Seu acesso está bloqueado. Procure seu responsável.',
      })
    }

    if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date()) {
      await logAttempt(usuario.id, cpf, false, 'BLOQUEIO_TEMPORARIO', req)

      return res.status(429).json({
        status: 'error',
        message: 'Acesso temporariamente bloqueado. Tente novamente mais tarde.',
      })
    }

    if (usuario.bloqueado_ate) {
      await sql`
        UPDATE usuarios
        SET tentativas_login = 0,
            bloqueado_ate = NULL
        WHERE id = ${usuario.id}
      `

      usuario.tentativas_login = 0
      usuario.bloqueado_ate = null
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash)

    if (!senhaCorreta) {
      await registerFailedAttempt(usuario)
      await logAttempt(usuario.id, cpf, false, 'SENHA_INCORRETA', req)

      return res.status(401).json({
        status: 'error',
        message: 'CPF ou senha inválidos.',
      })
    }

    const ip = getClientIp(req)

    await sql`
      UPDATE usuarios
      SET tentativas_login = 0,
          bloqueado_ate = NULL,
          ultimo_login = NOW(),
          ultimo_ip = ${ip}
      WHERE id = ${usuario.id}
    `

    await sql`
      DELETE FROM sessoes
      WHERE usuario_id = ${usuario.id}
        AND expira_em <= NOW()
    `

    await createSession(usuario.id, req, res)
    const quickAccess = await createQuickAccess(usuario.id, req)
    await logAttempt(usuario.id, cpf, true, 'LOGIN_OK', req)

    return res.status(200).json({
      status: 'ok',
      message: 'Login realizado com sucesso.',
      usuario: publicUser(usuario),
      quickAccess: {
        token: quickAccess.token,
        nome: usuario.nome,
        cpf: publicUser(usuario).cpf,
        expiresAt: quickAccess.expiresAt,
      },
    })
  } catch (error) {
    console.error('login_error', error)

    return res.status(500).json({
      status: 'error',
      message: 'Erro interno ao realizar o login.',
    })
  }
}

async function registerFailedAttempt(usuario) {
  const maxTentativas = await configInt('tentativas_login_maximas', 5)
  const tempoBloqueio = await configInt('tempo_bloqueio_minutos', 15)
  const tentativas = Number(usuario.tentativas_login || 0) + 1

  if (tentativas >= maxTentativas) {
    const bloqueadoAte = new Date(
      Date.now() + tempoBloqueio * 60 * 1000,
    ).toISOString()

    await sql`
      UPDATE usuarios
      SET tentativas_login = 0,
          bloqueado_ate = ${bloqueadoAte}
      WHERE id = ${usuario.id}
    `

    return
  }

  await sql`
    UPDATE usuarios
    SET tentativas_login = ${tentativas}
    WHERE id = ${usuario.id}
  `
}

async function configInt(chave, fallback) {
  const rows = await sql`
    SELECT valor
    FROM configuracoes
    WHERE chave = ${chave}
    LIMIT 1
  `

  const value = Number(rows[0]?.valor)

  return Number.isFinite(value) ? value : fallback
}

async function logAttempt(usuarioId, cpf, sucesso, motivo, req) {
  const ip = getClientIp(req)
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500)

  await sql`
    INSERT INTO login_logs (
      usuario_id,
      cpf_informado,
      sucesso,
      motivo,
      ip,
      user_agent
    )
    VALUES (
      ${usuarioId},
      ${cpf},
      ${sucesso},
      ${motivo},
      ${ip},
      ${userAgent}
    )
  `
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11)
}
