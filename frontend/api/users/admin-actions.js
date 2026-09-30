import bcrypt from 'bcryptjs'
import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import { ensureActivitiesSchema } from '../_lib/activities.js'
import { ensureWalletSchema } from '../_lib/wallet.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  }

  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    const action = String(req.body?.action || '').trim().toLowerCase()

    if (action === 'bulk_password') {
      const password = String(req.body?.senha || '')
      if (password.length < 6) {
        return res.status(400).json({
          status: 'error',
          message: 'A senha padrão deve ter pelo menos 6 caracteres.',
        })
      }

      const hash = await bcrypt.hash(password, 12)
      const rows = await sql`
        UPDATE usuarios
        SET senha_hash = ${hash},
            alterar_senha = TRUE,
            tentativas_login = 0,
            bloqueado_ate = NULL,
            atualizado_em = NOW()
        WHERE status = 'ativo'
        RETURNING id
      `

      await sql`
        DELETE FROM sessoes
        WHERE usuario_id <> ${admin.id}
      `
      await sql`
        UPDATE acessos_rapidos
        SET revogado_em = NOW()
        WHERE usuario_id <> ${admin.id}
          AND revogado_em IS NULL
      `

      return res.status(200).json({
        status: 'ok',
        message: `Senha padrão aplicada em ${rows.length} usuário(s) ativo(s).`,
        atualizados: rows.length,
      })
    }

    if (action === 'delete_user') {
      await ensureActivitiesSchema()
      await ensureWalletSchema()

      const usuarioId = Number(req.body?.usuario_id || 0)
      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return res.status(400).json({ status: 'error', message: 'Usuário inválido.' })
      }
      if (usuarioId === Number(admin.id)) {
        return res.status(400).json({ status: 'error', message: 'Você não pode excluir seu próprio usuário.' })
      }

      const rows = await sql`
        SELECT id, nome, perfil
        FROM usuarios
        WHERE id = ${usuarioId}
        LIMIT 1
      `
      const target = rows[0]
      if (!target) {
        return res.status(404).json({ status: 'error', message: 'Usuário não encontrado.' })
      }
      if (String(target.perfil || '').toUpperCase() === 'ADM') {
        return res.status(400).json({ status: 'error', message: 'Usuários ADM não podem ser apagados por esta ação.' })
      }

      const authored = await sql`
        SELECT COUNT(*)::int AS total
        FROM armazem_publicacoes
        WHERE autor_id = ${usuarioId}
      `
      if (Number(authored[0]?.total || 0) > 0) {
        return res.status(409).json({
          status: 'error',
          message: 'Esse usuário possui publicações no Armazém New. Inative-o em vez de excluir para preservar o histórico.',
        })
      }

      await sql`DELETE FROM remuneracao_tetos WHERE usuario_id = ${usuarioId}`
      await sql`DELETE FROM atividade_valores_usuario WHERE usuario_id = ${usuarioId}`
      await sql`DELETE FROM usuarios WHERE id = ${usuarioId}`

      return res.status(200).json({
        status: 'ok',
        message: `${target.nome} foi excluído do cadastro.`,
      })
    }

    return res.status(400).json({ status: 'error', message: 'Ação inválida.' })
  } catch (error) {
    if (error?.code === '23503') {
      return res.status(409).json({
        status: 'error',
        message: 'Esse usuário possui vínculos históricos e não pode ser apagado. Use Inativar.',
      })
    }
    console.error('users_admin_actions_error', error)
    return res.status(500).json({ status: 'error', message: 'Não foi possível concluir a ação.' })
  }
}

async function requireAdmin(req, res) {
  const usuario = await getSessionUser(req)
  if (!usuario) {
    res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
    return null
  }
  if (String(usuario.perfil || '').toUpperCase() !== 'ADM') {
    res.status(403).json({ status: 'error', message: 'Apenas administradores podem executar esta ação.' })
    return null
  }
  return usuario
}
