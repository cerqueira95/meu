import { getSessionUser } from '../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  try {
    const usuario = await getSessionUser(req)

    if (!usuario) {
      return res.status(401).json({
        status: 'error',
        message: 'Sessão não autenticada.',
      })
    }

    return res.status(200).json({
      status: 'ok',
      usuario,
    })
  } catch (error) {
    console.error('me_error', error)

    return res.status(500).json({
      status: 'error',
      message: 'Erro interno ao validar a sessão.',
    })
  }
}
