import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

const ALLOWED = ['curtir', 'parabens', 'importante']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  const usuario = await getSessionUser(req)

  if (!usuario) {
    return res.status(401).json({
      status: 'error',
      message: 'Sessão não autenticada.',
    })
  }

  try {
    const publicacaoId = Number(req.body?.publicacao_id)
    const tipo = String(req.body?.tipo || '').trim()

    if (!Number.isInteger(publicacaoId) || publicacaoId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Publicação inválida.',
      })
    }

    if (!ALLOWED.includes(tipo)) {
      return res.status(400).json({
        status: 'error',
        message: 'Reação inválida.',
      })
    }

    const existing = await sql`
      SELECT id, tipo
      FROM armazem_reacoes
      WHERE publicacao_id = ${publicacaoId}
        AND usuario_id = ${usuario.id}
      LIMIT 1
    `

    if (existing[0]?.tipo === tipo) {
      await sql`
        DELETE FROM armazem_reacoes
        WHERE id = ${existing[0].id}
      `

      return res.status(200).json({
        status: 'ok',
        message: 'Reação removida.',
      })
    }

    await sql`
      INSERT INTO armazem_reacoes (
        publicacao_id,
        usuario_id,
        tipo
      )
      VALUES (
        ${publicacaoId},
        ${usuario.id},
        ${tipo}
      )
      ON CONFLICT (publicacao_id, usuario_id)
      DO UPDATE SET
        tipo = EXCLUDED.tipo,
        criado_em = NOW()
    `

    return res.status(200).json({
      status: 'ok',
      message: 'Reação registrada.',
    })
  } catch (error) {
    console.error('news_react_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível registrar a reação.',
    })
  }
}
