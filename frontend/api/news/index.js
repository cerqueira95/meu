import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

const MAX_IMAGES = 4
const MAX_IMAGE_LENGTH = 900_000
const MAX_TOTAL_IMAGE_LENGTH = 3_200_000

export default async function handler(req, res) {
  const usuario = await requireUser(req, res)
  if (!usuario) return

  if (req.method === 'GET') {
    try {
      const [posts, comments, reactions, unreadRows] = await Promise.all([
        sql`
          SELECT
            p.id,
            p.titulo,
            p.conteudo,
            p.imagem_data,
            p.imagens_data,
            p.video_url,
            p.video_nome,
            p.video_tipo,
            p.criado_em,
            p.atualizado_em,
            u.id AS autor_id,
            u.nome AS autor_nome,
            u.cargo AS autor_cargo,
            u.perfil AS autor_perfil,
            u.foto_perfil AS autor_foto_perfil
          FROM armazem_publicacoes p
          INNER JOIN usuarios u ON u.id = p.autor_id
          ORDER BY p.criado_em DESC
          LIMIT 100
        `,
        sql`
          SELECT
            c.id,
            c.publicacao_id,
            c.texto,
            c.criado_em,
            c.atualizado_em,
            u.id AS usuario_id,
            u.nome AS usuario_nome,
            u.cargo AS usuario_cargo,
            u.foto_perfil AS usuario_foto_perfil
          FROM armazem_comentarios c
          INNER JOIN usuarios u ON u.id = c.usuario_id
          ORDER BY c.criado_em ASC
        `,
        sql`
          SELECT publicacao_id, usuario_id, tipo
          FROM armazem_reacoes
        `,
        sql`
          SELECT COUNT(*)::int AS count
          FROM armazem_publicacoes
          WHERE criado_em > COALESCE(${usuario.noticias_lidas_ate}, to_timestamp(0))
        `,
      ])

      const commentsByPost = new Map()
      for (const comment of comments) {
        const key = Number(comment.publicacao_id)
        const list = commentsByPost.get(key) || []
        list.push({
          id: Number(comment.id),
          texto: comment.texto,
          criado_em: comment.criado_em,
          atualizado_em: comment.atualizado_em ?? null,
          usuario: {
            id: Number(comment.usuario_id),
            nome: comment.usuario_nome,
            cargo: comment.usuario_cargo ?? null,
            foto_perfil: comment.usuario_foto_perfil ?? null,
          },
        })
        commentsByPost.set(key, list)
      }
      const reactionsByPost = new Map()
      for (const reaction of reactions) {
        const key = Number(reaction.publicacao_id)
        const entry = reactionsByPost.get(key) || {
          curtir: 0,
          parabens: 0,
          importante: 0,
          minha: null,
        }

        if (entry[reaction.tipo] !== undefined) {
          entry[reaction.tipo] += 1
        }

        if (Number(reaction.usuario_id) === Number(usuario.id)) {
          entry.minha = reaction.tipo
        }

        reactionsByPost.set(key, entry)
      }

      return res.status(200).json({
        status: 'ok',
        nao_lidas: Number(unreadRows[0]?.count || 0),
        publicacoes: posts.map((post) => {
          const imagens = normalizeStoredImages(post.imagens_data, post.imagem_data)

          return {
            id: Number(post.id),
            titulo: post.titulo,
            conteudo: post.conteudo,
            imagens_data: imagens,
            imagem_data: imagens[0] ?? null,
            video_url: post.video_url ?? null,
            video_nome: post.video_nome ?? null,
            video_tipo: post.video_tipo ?? null,
            criado_em: post.criado_em,
            atualizado_em: post.atualizado_em,
            autor: {
              id: Number(post.autor_id),
              nome: post.autor_nome,
              cargo: post.autor_cargo ?? null,
              perfil: post.autor_perfil,
              foto_perfil: post.autor_foto_perfil ?? null,
            },
            comentarios: commentsByPost.get(Number(post.id)) || [],
            reacoes: reactionsByPost.get(Number(post.id)) || {
              curtir: 0,
              parabens: 0,
              importante: 0,
              minha: null,
            },
          }
        }),
      })
    } catch (error) {
      console.error('news_list_error', error)
      return res.status(500).json({
        status: 'error',
        message: 'Não foi possível carregar as notícias.',
      })
    }
  }

  if (req.method === 'POST') {
    if (String(usuario.perfil || '').toUpperCase() !== 'ADM') {
      return res.status(403).json({
        status: 'error',
        message: 'Apenas administradores podem criar publicações.',
      })
    }

    try {
      const titulo = String(req.body?.titulo || '').trim()
      const conteudo = String(req.body?.conteudo || '').trim()
      const imagensData = normalizeImages(req.body?.imagens_data)
      const video = normalizeVideo(req.body)

      if (imagensData.length > 0 && video.url) {
        return res.status(400).json({
          status: 'error',
          message: 'Use fotos ou vídeo na publicação, não os dois ao mesmo tempo.',
        })
      }
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
        INSERT INTO armazem_publicacoes (
          autor_id,
          titulo,
          conteudo,
          imagem_data,
          imagens_data,
          video_url,
          video_nome,
          video_tipo
        )
        VALUES (
          ${usuario.id},
          ${titulo},
          ${conteudo},
          ${imagensData[0] ?? null},
          ${JSON.stringify(imagensData)}::jsonb,
          ${video.url},
          ${video.nome},
          ${video.tipo}
        )
        RETURNING id
      `

      return res.status(201).json({
        status: 'ok',
        message: 'Publicação criada com sucesso.',
        id: Number(rows[0].id),
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

      if (error?.message === 'INVALID_VIDEO') {
        return res.status(400).json({
          status: 'error',
          message: 'O vídeo enviado é inválido.',
        })
      }

      console.error('news_create_error', error)
      return res.status(500).json({
        status: 'error',
        message: 'Não foi possível publicar a notícia.',
      })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({
    status: 'error',
    message: 'Método não permitido.',
  })
}

async function requireUser(req, res) {
  try {
    const usuario = await getSessionUser(req)

    if (!usuario) {
      res.status(401).json({
        status: 'error',
        message: 'Sessão não autenticada.',
      })
      return null
    }

    return usuario
  } catch (error) {
    console.error('news_auth_error', error)
    res.status(500).json({
      status: 'error',
      message: 'Não foi possível validar seu acesso.',
    })
    return null
  }
}

function normalizeImages(value) {
  if (!value) return []

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

function normalizeVideo(body = {}) {
  const url = String(body.video_url || '').trim()
  if (!url) {
    return { url: null, nome: null, tipo: null }
  }

  if (!url.startsWith('/local-media/') && !/^https:\/\//i.test(url)) {
    throw new Error('INVALID_VIDEO')
  }

  const tipo = String(body.video_tipo || '').trim().toLowerCase()
  if (tipo && !['video/mp4', 'video/webm', 'video/quicktime'].includes(tipo)) {
    throw new Error('INVALID_VIDEO')
  }

  return {
    url,
    nome: String(body.video_nome || 'Vídeo').trim().slice(0, 255) || 'Vídeo',
    tipo: tipo || 'video/mp4',
  }
}

function normalizeStoredImages(value, fallback) {
  const items = Array.isArray(value) ? value.filter(Boolean) : []

  if (items.length > 0) {
    return items.slice(0, MAX_IMAGES)
  }

  return fallback ? [fallback] : []
}