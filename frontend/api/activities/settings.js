import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import { logAdminAction } from '../_lib/remuneration-admin.js'
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
      const [atividades, usuarios, overrides] = await Promise.all([
        listActivityConfigs(),
        sql`
          SELECT id, nome, turno, perfil
          FROM usuarios
          WHERE status = 'ativo'
            AND UPPER(COALESCE(perfil, '')) = 'AJUDANTE'
          ORDER BY nome
        `,
        sql`
          SELECT atividade_chave, usuario_id, valor_unitario
          FROM atividade_valores_usuario
          ORDER BY atividade_chave, usuario_id
        `,
      ])

      return res.status(200).json({
        status: 'ok',
        atividades,
        usuarios: usuarios.map((usuario) => ({
          id: Number(usuario.id),
          nome: usuario.nome,
          turno: usuario.turno || '',
          perfil: usuario.perfil || '',
        })),
        valores_personalizados: overrides.map((row) => ({
          atividade_chave: row.atividade_chave,
          usuario_id: Number(row.usuario_id),
          valor_unitario: Number(row.valor_unitario || 0),
        })),
      })
    }

    if (req.method === 'POST') {
      const chave = String(req.body?.chave || '').trim().toLowerCase()
      const valor = Number(req.body?.valor_unitario)
      const escopo = String(req.body?.escopo || 'todos').trim().toLowerCase()
      const usuariosIds = Array.isArray(req.body?.usuarios_ids)
        ? [...new Set(req.body.usuarios_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
        : []

      if (!chave) {
        return res.status(400).json({ status: 'error', message: 'Atividade inválida.' })
      }

      if (!Number.isFinite(valor) || valor < 0 || valor > 100000) {
        return res.status(400).json({ status: 'error', message: 'Informe um valor válido.' })
      }

      const exists = await sql`
        SELECT id
        FROM atividade_catalogo
        WHERE chave = ${chave}
        LIMIT 1
      `

      if (!exists[0]) {
        return res.status(404).json({ status: 'error', message: 'Atividade não encontrada.' })
      }

      if (escopo === 'todos') {
        const rows = await sql`
          UPDATE atividade_catalogo
          SET valor_unitario = ${valor},
              atualizado_em = NOW()
          WHERE chave = ${chave}
          RETURNING id, chave, nome, valor_unitario, ativo, atualizado_em
        `

        await sql`
          DELETE FROM atividade_valores_usuario
          WHERE atividade_chave = ${chave}
        `

        await logAdminAction(admin, {
          action: 'alterar_valor_atividade',
          entity: 'atividade_catalogo',
          entityId: chave,
          description: `Valor da atividade ${rows[0].nome} alterado para R$ ${valor.toFixed(2)} para todos os ajudantes.`,
          after: { valor_unitario: valor, escopo: 'todos' },
        })

        return res.status(200).json({
          status: 'ok',
          message: 'Valor atualizado para todos os ajudantes.',
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

      if (escopo === 'selecionados') {
        if (!usuariosIds.length) {
          return res.status(400).json({ status: 'error', message: 'Selecione pelo menos um ajudante.' })
        }

        for (const usuarioId of usuariosIds) {
          const userRows = await sql`
            SELECT id
            FROM usuarios
            WHERE id = ${usuarioId}
              AND status = 'ativo'
              AND UPPER(COALESCE(perfil, '')) = 'AJUDANTE'
            LIMIT 1
          `

          if (!userRows[0]) {
            return res.status(400).json({
              status: 'error',
              message: 'Um dos ajudantes selecionados é inválido ou está inativo.',
            })
          }

          await sql`
            INSERT INTO atividade_valores_usuario (
              atividade_chave,
              usuario_id,
              valor_unitario,
              atualizado_em
            )
            VALUES (
              ${chave},
              ${usuarioId},
              ${valor},
              NOW()
            )
            ON CONFLICT (atividade_chave, usuario_id)
            DO UPDATE SET
              valor_unitario = EXCLUDED.valor_unitario,
              atualizado_em = NOW()
          `
        }

        await logAdminAction(admin, {
          action: 'alterar_valor_atividade',
          entity: 'atividade_valor_usuario',
          entityId: chave,
          description: `Valor personalizado da atividade ${chave} alterado para R$ ${valor.toFixed(2)} em ${usuariosIds.length} ajudante(s).`,
          after: { valor_unitario: valor, escopo: 'selecionados', usuarios_ids: usuariosIds },
        })

        return res.status(200).json({
          status: 'ok',
          message: `Valor personalizado aplicado para ${usuariosIds.length} ajudante(s).`,
        })
      }

      return res.status(400).json({ status: 'error', message: 'Escopo de alteração inválido.' })
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
