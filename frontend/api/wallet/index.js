import { getSessionUser } from '../_lib/session.js'
import { getWalletData } from '../_lib/remuneration-admin.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
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
    const data = await getWalletData(usuario.id, req.query?.mes)
    return res.status(200).json(data)
  } catch (error) {
    if (error?.code === 'USER_NOT_FOUND') {
      return res.status(404).json({
        status: 'error',
        message: 'Usuário não encontrado.',
      })
    }

    console.error('wallet_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível carregar sua carteira.',
    })
  }
}
