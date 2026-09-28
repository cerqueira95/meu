import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

export default async function handler(req, res) {
  const usuario = await requireUser(req, res)
  if (!usuario) return

  if (req.method === 'GET') {
    try {
      const [posts, comments, reactions] = await Promise.all([
        sql`
          SELECT
            p.id,
            p.titulo,
            p.conteudo,
            p.imagem_data,
            p.criado_em,
            p.atualizado_em,
            u.id AS autor_id,
            u.nome AS autor_nome,
            u.cargo AS autor_cargo,
            u.perfil AS autor_perfil
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
            u.id AS usuario_id,
            u.nome AS usuario_nome,
            u.cargo AS usuario_cargo
          FROM armazem_comentarios c
          INNER JOIN usuarios u ON u.id = c.usuario_id
          ORDER BY c.criado_em ASC
        `,
        sql`
          SELECT publicacao_id, usuario_id, tipo
          FROM armazem_reacoes
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
          usuario: {
            id: Number(comment.usuario_id),
            nome: comment.usuario_nome,
            cargo: comment.usuario_cargo ?? null,
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
        publicacoes: posts.map((post) => ({
          id: Number(post.id),
          titulo: post.titulo,
          conteudo: post.conteudo,
          imagem_data: post.imagem_data ?? null,
          criado_em: post.criado_em,
          atualizado_em: post.atualizado_em,
          autor: {
            id: Number(post.autor_id),
            nome: post.autor_nome,
            cargo: post.autor_cargo ?? null,
            perfil: post.autor_perfil,
          },
          comentarios: commentsByPost.get(Number(post.id)) || [],
          reacoes: reactionsByPost.get(Number(post.id)) || {
            curtir: 0,
            parabens: 0,
            importante: 0,
            minha: null,
          },
        })),
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
      const imagemData = normalizeImage(req.body?.imagem_data)

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
          imagem_data
        )
        VALUES (
          ${usuario.id},
          ${titulo},
          ${conteudo},
          ${imagemData}
        )
        RETURNING id
      `

      return res.status(201).json({
        status: 'ok',
        message: 'Publicação criada com sucesso.',
        id: Number(rows[0].id),
      })
    } catch (error) {
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

function normalizeImage(value) {
  const image = String(value || '').trim()

  if (!image) return null

  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image)) {
    throw new Error('INVALID_IMAGE')
  }

  if (image.length > 3_500_000) {
    throw new Error('IMAGE_TOO_LARGE')
  }

  return image
}
