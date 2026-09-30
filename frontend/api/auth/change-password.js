import bcrypt from 'bcryptjs'
import { sql } from '../_lib/db.js'
import {
  getCookie,
  getSessionUser,
  hashToken,
} from '../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  const usuario = await getSessionUser(req)

  if (!usuario) {
    return res.status(401).json({
      status: 'error',
      message: 'Sessão não autenticada.',
    })
  }

  try {
    const senhaAtual = String(req.body?.senha_atual || '')
    const novaSenha = String(req.body?.nova_senha || '')
    const confirmarSenha = String(req.body?.confirmar_senha || '')

    if (!senhaAtual) {
      return res.status(400).json({
        status: 'error',
        message: 'Informe sua senha atual.',
      })
    }

    if (novaSenha.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'A nova senha deve ter pelo menos 6 caracteres.',
      })
    }

    if (novaSenha !== confirmarSenha) {
      return res.status(400).json({
        status: 'error',
        message: 'A confirmação da nova senha não confere.',
      })
    }

    if (senhaAtual === novaSenha) {
      return res.status(400).json({
        status: 'error',
        message: 'A nova senha deve ser diferente da senha atual.',
      })
    }

    const rows = await sql`
      SELECT senha_hash
      FROM usuarios
      WHERE id = ${usuario.id}
        AND status = 'ativo'
      LIMIT 1
    `

    if (!rows[0]) {
      return res.status(404).json({
        status: 'error',
        message: 'Usuário não encontrado.',
      })
    }

    const senhaCorreta = await bcrypt.compare(senhaAtual, rows[0].senha_hash)

    if (!senhaCorreta) {
      return res.status(401).json({
        status: 'error',
        message: 'A senha atual está incorreta.',
      })
    }

    const novaSenhaHash = await bcrypt.hash(novaSenha, 12)

    await sql`
      UPDATE usuarios
      SET senha_hash = ${novaSenhaHash},
          alterar_senha = FALSE,
          tentativas_login = 0,
          bloqueado_ate = NULL,
          atualizado_em = NOW()
      WHERE id = ${usuario.id}
    `

    // Revoga acessos rápidos porque eles permitem entrar sem digitar a senha.
    await sql`
      UPDATE acessos_rapidos
      SET revogado_em = NOW()
      WHERE usuario_id = ${usuario.id}
        AND revogado_em IS NULL
    `

    // Encerra outras sessões, mas mantém a sessão usada para trocar a senha.
    const currentToken = getCookie(req)
    if (currentToken) {
      await sql`
        DELETE FROM sessoes
        WHERE usuario_id = ${usuario.id}
          AND token_hash <> ${hashToken(currentToken)}
      `
    } else {
      await sql`
        DELETE FROM sessoes
        WHERE usuario_id = ${usuario.id}
      `
    }

    return res.status(200).json({
      status: 'ok',
      message: 'Senha alterada com sucesso.',
    })
  } catch (error) {
    console.error('change_password_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível alterar sua senha.',
    })
  }
}
