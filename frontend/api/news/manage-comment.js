import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  }

  const usuario = await requireAdmin(req, res)
  if (!usuario) return

  try {
    const id = Number(req.body?.id)
    const action = String(req.body?.action || '').trim().toLowerCase()

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ status: 'error', message: 'Comentário inválido.' })
    }

    if (action === 'delete') {
      const rows = await sql`
        DELETE FROM armazem_comentarios
        WHERE id = ${id}
        RETURNING id
      `

      if (!rows[0]) {
        return res.status(404).json({ status: 'error', message: 'Comentário não encontrado.' })
      }

      return res.status(200).json({
        status: 'ok',
        message: 'Comentário excluído.',
      })
    }

    if (action !== 'edit') {
      return res.status(400).json({ status: 'error', message: 'Ação inválida.' })
    }

    const texto = String(req.body?.texto || '').trim()

    if (texto.length < 1 || texto.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'O comentário deve ter entre 1 e 1.000 caracteres.',
      })
    }

    const rows = await sql`
      UPDATE armazem_comentarios
      SET texto = ${texto},
          atualizado_em = NOW()
      WHERE id = ${id}
      RETURNING id
    `

    if (!rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Comentário não encontrado.' })
    }

    return res.status(200).json({
      status: 'ok',
      message: 'Comentário atualizado.',
    })
  } catch (error) {
    console.error('news_manage_comment_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível alterar o comentário.',
    })
  }
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
        message: 'Apenas administradores podem gerenciar comentários.',
      })
      return null
    }

    return usuario
  } catch (error) {
    console.error('news_comment_admin_auth_error', error)
    res.status(500).json({
      status: 'error',
      message: 'Não foi possível validar seu acesso.',
    })
    return null
  }
}
