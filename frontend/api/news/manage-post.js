import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

const MAX_IMAGES = 4
const MAX_IMAGE_LENGTH = 900_000
const MAX_TOTAL_IMAGE_LENGTH = 3_200_000

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
      return res.status(400).json({ status: 'error', message: 'Publicação inválida.' })
    }

    if (action === 'delete') {
      const rows = await sql`
        DELETE FROM armazem_publicacoes
        WHERE id = ${id}
        RETURNING id
      `

      if (!rows[0]) {
        return res.status(404).json({ status: 'error', message: 'Publicação não encontrada.' })
      }

      return res.status(200).json({
        status: 'ok',
        message: 'Publicação excluída com sucesso.',
      })
    }

    if (action !== 'edit') {
      return res.status(400).json({ status: 'error', message: 'Ação inválida.' })
    }

    const titulo = String(req.body?.titulo || '').trim()
    const conteudo = String(req.body?.conteudo || '').trim()
    const imagensData = normalizeImages(req.body?.imagens_data)

    if (titulo.length < 3 || titulo.length > 180) {
      return res.status(400).json({
        status: 'error',
        message: 'Informe um título entre 3 e 180 caracteres.',
      })
    }

    if (conteudo.length < 3 || conteudo.length > 20000) {
      return res.status(400).json({
        status: 'error',
        message: 'O texto da publicação deve ter entre 3 e 20.000 caracteres.',
      })
    }

    const rows = await sql`
      UPDATE armazem_publicacoes
      SET titulo = ${titulo},
          conteudo = ${conteudo},
          imagem_data = ${imagensData[0] ?? null},
          imagens_data = ${JSON.stringify(imagensData)}::jsonb,
          atualizado_em = NOW()
      WHERE id = ${id}
      RETURNING id
    `

    if (!rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Publicação não encontrada.' })
    }

    return res.status(200).json({
      status: 'ok',
      message: 'Publicação atualizada com sucesso.',
    })
  } catch (error) {
    if (error?.message === 'TOO_MANY_IMAGES') {
      return res.status(400).json({
        status: 'error',
        message: 'Você pode adicionar no máximo 4 fotos por publicação.',
      })
    }

    if (error?.message === 'INVALID_IMAGE') {
      return res.status(400).json({
        status: 'error',
        message: 'Uma das fotos enviadas é inválida.',
      })
    }

    if (error?.message === 'IMAGE_TOO_LARGE') {
      return res.status(400).json({
        status: 'error',
        message: 'As fotos ficaram muito grandes. Tente imagens menores.',
      })
    }

    console.error('news_manage_post_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível alterar a publicação.',
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
        message: 'Apenas administradores podem gerenciar publicações.',
      })
      return null
    }

    return usuario
  } catch (error) {
    console.error('news_admin_auth_error', error)
    res.status(500).json({
      status: 'error',
      message: 'Não foi possível validar seu acesso.',
    })
    return null
  }
}

function normalizeImages(value) {
  const items = Array.isArray(value) ? value : []

  if (items.length > MAX_IMAGES) {
    throw new Error('TOO_MANY_IMAGES')
  }

  let totalLength = 0

  const normalized = items.map((item) => {
    const image = String(item || '').trim()

    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image)) {
      throw new Error('INVALID_IMAGE')
    }

    if (image.length > MAX_IMAGE_LENGTH) {
      throw new Error('IMAGE_TOO_LARGE')
    }

    totalLength += image.length
    return image
  })

  if (totalLength > MAX_TOTAL_IMAGE_LENGTH) {
    throw new Error('IMAGE_TOO_LARGE')
  }

  return normalized
}
