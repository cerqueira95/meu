import {
  createSession,
  getQuickAccessUser,
} from '../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  try {
    const token = String(req.body?.token || '')

    if (token.length < 20) {
      return res.status(401).json({
        status: 'error',
        message: 'Acesso rápido inválido.',
      })
    }

    const usuario = await getQuickAccessUser(token, req)

    if (!usuario) {
      return res.status(401).json({
        status: 'error',
        message: 'Acesso rápido expirado ou inválido.',
      })
    }

    await createSession(usuario.id, req, res)

    return res.status(200).json({
      status: 'ok',
      message: 'Acesso rápido realizado com sucesso.',
      usuario,
    })
  } catch (error) {
    console.error('quick_login_error', error)

    return res.status(500).json({
      status: 'error',
      message: 'Erro interno ao realizar o acesso rápido.',
    })
  }
}
