import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { getSessionUser } from '../_lib/session.js'

const MAX_VIDEO_BYTES = 35 * 1024 * 1024
const ALLOWED_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  }

  const usuario = await getSessionUser(req)
  if (!usuario) {
    return res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
  }

  if (String(usuario.perfil || '').toUpperCase() !== 'ADM') {
    return res.status(403).json({
      status: 'error',
      message: 'Apenas administradores podem enviar vídeos.',
    })
  }

  try {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase()
    if (!ALLOWED_TYPES.has(contentType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Use um vídeo MP4, WebM ou MOV.',
      })
    }

    const body = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body || '')

    if (body.length === 0 || body.length > MAX_VIDEO_BYTES) {
      return res.status(400).json({
        status: 'error',
        message: 'O vídeo deve ter no máximo 35 MB.',
      })
    }

    const ext = contentType === 'video/webm'
      ? '.webm'
      : contentType === 'video/quicktime'
        ? '.mov'
        : '.mp4'

    const directory = path.resolve(process.cwd(), 'public', 'local-media')
    await fs.mkdir(directory, { recursive: true })

    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
    await fs.writeFile(path.join(directory, filename), body)

    return res.status(201).json({
      status: 'ok',
      url: `/local-media/${filename}`,
      nome: String(req.headers['x-file-name'] || 'video').slice(0, 255),
      tipo: contentType,
      local: true,
    })
  } catch (error) {
    console.error('media_upload_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível enviar o vídeo.',
    })
  }
}