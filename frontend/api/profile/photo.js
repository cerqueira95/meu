import { sql } from '../_lib/db.js'
import { getSessionUser, publicUser } from '../_lib/session.js'

const MAX_PROFILE_IMAGE_LENGTH = 700_000

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  }

  const usuario = await getSessionUser(req)
  if (!usuario) {
    return res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
  }

  try {
    const foto = normalizeImage(req.body?.foto_perfil)

    const rows = await sql`
      UPDATE usuarios
      SET foto_perfil = ${foto},
          atualizado_em = NOW()
      WHERE id = ${usuario.id}
      RETURNING *
    `

    return res.status(200).json({
      status: 'ok',
      message: foto ? 'Foto de perfil atualizada.' : 'Foto de perfil removida.',
      usuario: publicUser(rows[0]),
    })
  } catch (error) {
    if (error?.message === 'INVALID_PROFILE_IMAGE') {
      return res.status(400).json({
        status: 'error',
        message: 'A foto enviada é inválida.',
      })
    }

    if (error?.message === 'PROFILE_IMAGE_TOO_LARGE') {
      return res.status(400).json({
        status: 'error',
        message: 'A foto ficou muito grande.',
      })
    }

    console.error('profile_photo_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível atualizar sua foto.',
    })
  }
}

function normalizeImage(value) {
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