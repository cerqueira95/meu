import { getSessionUser } from '../_lib/session.js'
import {
  collectCurrentRateio,
  publicFailureMessage,
} from '../_lib/wms-sync.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    const result = await collectCurrentRateio()

    return res.status(200).json({
      status: 'ok',
      message: `Coleta concluída: ${result.count} registros do Rateio, ${result.itemCount || 0} do WMS Item e ${result.escalonadaCount || 0} resultados de escalonada em ${result.date}.`,
      ...result,
    })
  } catch (error) {
    console.error('wms_collect_error', {
      code: error?.code || null,
      status: error?.status || null,
      message: error?.message || 'unknown',
    })

    return res.status(error?.code === 'WMS_AUTH_FAILED' ? 401 : 502).json({
      status: 'error',
      message: publicFailureMessage(error),
    })
  }
}

async function requireAdmin(req, res) {
  try {
    const usuario = await getSessionUser(req)

    if (!usuario) {
      res.status(401).json({
        status: 'error',
        message: 'Sessão não autenticada.',
      })
      return null
    }

    if (String(usuario.perfil || '').toUpperCase() !== 'ADM') {
      res.status(403).json({
        status: 'error',
        message: 'Apenas administradores podem executar a coleta WMS.',
      })
      return null
    }

    return usuario
  } catch {
    res.status(500).json({
      status: 'error',
      message: 'Não foi possível validar seu acesso.',
    })
    return null
  }
}
