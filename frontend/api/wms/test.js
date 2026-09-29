import { getSessionUser } from '../_lib/session.js'
import {
  readWmsCredentials,
  saveWmsIntegrationStatus,
} from '../_lib/wms-secrets.js'
import { validateWmsCredentials } from '../_lib/wms-client.js'

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
    const credentials = await readWmsCredentials()

    if (!credentials) {
      return res.status(400).json({
        status: 'error',
        message: 'Salve as credenciais do WMS antes de testar.',
      })
    }

    const result = await validateWmsCredentials(
      credentials.username,
      credentials.password,
    )

    await saveWmsIntegrationStatus({
      status: 'ok',
      message: 'Conexão validada com sucesso.',
      checkedAt: new Date().toISOString(),
      count: result.count,
    })

    return res.status(200).json({
      status: 'ok',
      message: 'Conexão com o WMS validada com sucesso.',
      count: result.count,
    })
  } catch (error) {
    const message = normalizeMessage(error)

    try {
      await saveWmsIntegrationStatus({
        status: 'error',
        message,
        checkedAt: new Date().toISOString(),
        count: 0,
      })
    } catch {
      // O teste continua retornando a falha original.
    }

    console.error('wms_test_error', {
      code: error?.code || null,
      status: error?.status || null,
      message: error?.message || 'unknown',
    })

    return res.status(error?.code === 'WMS_AUTH_FAILED' ? 401 : 502).json({
      status: 'error',
      message,
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
        message: 'Apenas administradores podem testar a integração WMS.',
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

function normalizeMessage(error) {
  if (error?.code === 'WMS_AUTH_FAILED') {
    return 'Login ou senha recusados pelo WMS.'
  }

  if (error?.code === 'WMS_TOKEN_MISSING') {
    return 'O WMS autenticou, mas não retornou o token esperado.'
  }

  if (error?.code === 'WMS_RATEIO_FAILED') {
    return 'A autenticação funcionou, mas o relatório de rateio não respondeu.'
  }

  return 'Não foi possível validar a conexão com o WMS.'
}
