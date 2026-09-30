import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

export default async function handler(req, res) {
  try {
    await ensureSchema()

    if (req.method === 'POST') {
      const cpf = onlyDigits(req.body?.cpf)
      const turno = clean(req.body?.turno, 80)
      const funcao = clean(req.body?.funcao, 120)

      if (cpf.length !== 11) {
        return res.status(400).json({ status: 'error', message: 'Informe um CPF válido.' })
      }
      if (!turno) {
        return res.status(400).json({ status: 'error', message: 'Informe seu turno.' })
      }
      if (!funcao) {
        return res.status(400).json({ status: 'error', message: 'Informe sua função.' })
      }

      const existing = await sql`
        SELECT id
        FROM solicitacoes_acesso
        WHERE cpf = ${cpf} AND status = 'pendente'
        LIMIT 1
      `

      if (existing[0]) {
        await sql`
          UPDATE solicitacoes_acesso
          SET turno = ${turno}, funcao = ${funcao}, atualizado_em = NOW()
          WHERE id = ${existing[0].id}
        `
        return res.status(200).json({
          status: 'ok',
          message: 'Sua solicitação já estava registrada e foi atualizada.',
        })
      }

      await sql`
        INSERT INTO solicitacoes_acesso (
          cpf, turno, funcao, status, criado_em, atualizado_em
        )
        VALUES (${cpf}, ${turno}, ${funcao}, 'pendente', NOW(), NOW())
      `

      return res.status(201).json({
        status: 'ok',
        message: 'Solicitação enviada. Aguarde a liberação do seu acesso.',
      })
    }

    const admin = await requireAdmin(req, res)
    if (!admin) return

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, cpf, turno, funcao, status, criado_em, atualizado_em
        FROM solicitacoes_acesso
        ORDER BY CASE WHEN status = 'pendente' THEN 0 ELSE 1 END, criado_em DESC
        LIMIT 300
      `
      return res.status(200).json({
        status: 'ok',
        solicitacoes: rows.map((row) => ({ ...row, id: Number(row.id) })),
      })
    }

    if (req.method === 'PATCH') {
      const id = Number(req.body?.id || 0)
      const status = String(req.body?.status || '').trim().toLowerCase()

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ status: 'error', message: 'Solicitação inválida.' })
      }
      if (!['atendido', 'descartado', 'pendente'].includes(status)) {
        return res.status(400).json({ status: 'error', message: 'Status inválido.' })
      }

      const rows = await sql`
        UPDATE solicitacoes_acesso
        SET status = ${status}, atualizado_em = NOW()
        WHERE id = ${id}
        RETURNING id, cpf, turno, funcao, status, criado_em, atualizado_em
      `

      if (!rows[0]) {
        return res.status(404).json({ status: 'error', message: 'Solicitação não encontrada.' })
      }

      return res.status(200).json({
        status: 'ok',
        message: status === 'atendido'
          ? 'Solicitação marcada como atendida.'
          : status === 'descartado'
            ? 'Solicitação descartada.'
            : 'Solicitação reaberta.',
        solicitacao: { ...rows[0], id: Number(rows[0].id) },
      })
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('access_requests_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar a solicitação de acesso.',
    })
  }
}

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS solicitacoes_acesso (
      id BIGSERIAL PRIMARY KEY,
      cpf VARCHAR(11) NOT NULL,
      turno VARCHAR(80) NOT NULL,
      funcao VARCHAR(120) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pendente',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_acesso_status
    ON solicitacoes_acesso(status, criado_em DESC)
  `
}

async function requireAdmin(req, res) {
  const usuario = await getSessionUser(req)
  if (!usuario) {
    res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
    return null
  }
  if (String(usuario.perfil || '').toUpperCase() !== 'ADM') {
    res.status(403).json({ status: 'error', message: 'Acesso restrito ao administrador.' })
    return null
  }
  return usuario
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11)
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max)
}
