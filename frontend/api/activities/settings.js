import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import {
  ensureActivitiesSchema,
  listActivityConfigs,
} from '../_lib/activities.js'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    await ensureActivitiesSchema()

    if (req.method === 'GET') {
      return res.status(200).json({
        status: 'ok',
        atividades: await listActivityConfigs(),
      })
    }

    if (req.method === 'POST') {
      const chave = String(req.body?.chave || '').trim().toLowerCase()
      const valor = Number(req.body?.valor_unitario)

      if (!chave) {
        return res.status(400).json({
          status: 'error',
          message: 'Atividade inválida.',
        })
      }

      if (!Number.isFinite(valor) || valor < 0 || valor > 100000) {
        return res.status(400).json({
          status: 'error',
          message: 'Informe um valor válido.',
        })
      }

      const rows = await sql`
        UPDATE atividade_catalogo
        SET valor_unitario = ${valor},
            atualizado_em = NOW()
        WHERE chave = ${chave}
        RETURNING id, chave, nome, valor_unitario, ativo, atualizado_em
      `

      if (!rows[0]) {
        return res.status(404).json({
          status: 'error',
          message: 'Atividade não encontrada.',
        })
      }

      return res.status(200).json({
        status: 'ok',
        message: 'Valor atualizado com sucesso.',
        atividade: {
          id: Number(rows[0].id),
          chave: rows[0].chave,
          nome: rows[0].nome,
          valor_unitario: Number(rows[0].valor_unitario || 0),
          ativo: Boolean(rows[0].ativo),
          atualizado_em: rows[0].atualizado_em,
        },
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('activities_settings_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível carregar os valores das atividades.',
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
        message: 'Apenas administradores podem editar valores das atividades.',
      })
      return null
    }

    return usuario
  } catch (error) {
    console.error('activities_settings_auth_error', error)
    res.status(500).json({
      status: 'error',
      message: 'Não foi possível validar seu acesso.',
    })
    return null
  }
}
