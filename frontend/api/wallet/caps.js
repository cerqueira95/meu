import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import { ensureWalletSchema } from '../_lib/wallet.js'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    await ensureWalletSchema()

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT u.id, u.nome, u.turno, u.perfil,
               t.valor_teto, t.atualizado_em
        FROM usuarios u
        LEFT JOIN remuneracao_tetos t ON t.usuario_id = u.id
        WHERE u.status = 'ativo'
          AND UPPER(COALESCE(u.perfil, '')) = 'AJUDANTE'
        ORDER BY u.turno, u.nome
      `
      return res.status(200).json({
        status: 'ok',
        usuarios: rows.map((row) => ({
          id: Number(row.id),
          nome: row.nome,
          turno: row.turno || '',
          perfil: row.perfil || '',
          valor_teto: row.valor_teto == null ? null : Number(row.valor_teto),
          atualizado_em: row.atualizado_em,
        })),
      })
    }

    if (req.method === 'POST') {
      const usuarioId = Number(req.body?.usuario_id || 0)
      const semTeto = Boolean(req.body?.sem_teto)
      const value = semTeto ? null : Number(req.body?.valor_teto)

      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return res.status(400).json({ status: 'error', message: 'Selecione um ajudante válido.' })
      }
      if (!semTeto && (!Number.isFinite(value) || value < 0 || value > 100000)) {
        return res.status(400).json({ status: 'error', message: 'Informe um teto válido.' })
      }
      const userRows = await sql`
        SELECT id, nome, turno
        FROM usuarios
        WHERE id = ${usuarioId}
          AND status = 'ativo'
          AND UPPER(COALESCE(perfil, '')) = 'AJUDANTE'
        LIMIT 1
      `
      if (!userRows[0]) {
        return res.status(404).json({ status: 'error', message: 'Ajudante não encontrado ou inativo.' })
      }

      if (semTeto) {
        await sql`DELETE FROM remuneracao_tetos WHERE usuario_id = ${usuarioId}`
      } else {
        await sql`
          INSERT INTO remuneracao_tetos (
            usuario_id, valor_teto, atualizado_por_usuario_id,
            atualizado_por_nome, atualizado_em
          )
          VALUES (${usuarioId}, ${value}, ${admin.id}, ${admin.nome}, NOW())
          ON CONFLICT (usuario_id)
          DO UPDATE SET valor_teto = EXCLUDED.valor_teto,
                        atualizado_por_usuario_id = EXCLUDED.atualizado_por_usuario_id,
                        atualizado_por_nome = EXCLUDED.atualizado_por_nome,
                        atualizado_em = NOW()
        `
      }
      return res.status(200).json({
        status: 'ok',
        message: semTeto
          ? 'Teto removido. Este ajudante ficou sem limite.'
          : 'Teto atualizado com sucesso.',
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('wallet_caps_error', error)
    return res.status(500).json({ status: 'error', message: 'Não foi possível carregar ou salvar os tetos.' })
  }
}

async function requireAdmin(req, res) {
  const usuario = await getSessionUser(req)
  if (!usuario) {
    res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
    return null
  }
  if (String(usuario.perfil || '').toUpperCase() !== 'ADM') {
    res.status(403).json({ status: 'error', message: 'Apenas administradores podem configurar tetos.' })
    return null
  }
  return usuario
}
