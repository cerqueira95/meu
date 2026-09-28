import { destroySession } from '../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  try {
    await destroySession(req, res)

    return res.status(200).json({
      status: 'ok',
      message: 'Sessão encerrada.',
    })
  } catch (error) {
    console.error('logout_error', error)

    return res.status(500).json({
      status: 'error',
      message: 'Erro interno ao encerrar a sessão.',
    })
  }
}
