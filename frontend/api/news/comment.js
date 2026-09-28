import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

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
    const texto = String(req.body?.texto || '').trim()

    if (!Number.isInteger(publicacaoId) || publicacaoId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Publicação inválida.',
      })
    }

    if (texto.length < 1 || texto.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'O comentário deve ter entre 1 e 1.000 caracteres.',
      })
    }

    const post = await sql`
      SELECT id FROM armazem_publicacoes WHERE id = ${publicacaoId} LIMIT 1
    `

    if (!post[0]) {
      return res.status(404).json({
        status: 'error',
        message: 'Publicação não encontrada.',
      })
    }

    await sql`
      INSERT INTO armazem_comentarios (
        publicacao_id,
        usuario_id,
        texto
      )
      VALUES (
        ${publicacaoId},
        ${usuario.id},
        ${texto}
      )
    `

    return res.status(201).json({
      status: 'ok',
      message: 'Comentário publicado.',
    })
  } catch (error) {
    console.error('news_comment_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível publicar o comentário.',
    })
  }
}
