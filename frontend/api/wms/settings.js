import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import {
  getWmsCredentialStatus,
  readWmsIntegrationStatus,
  saveWmsCredentials,
} from '../_lib/wms-secrets.js'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  if (req.method === 'GET') {
    try {
      const credentials = await getWmsCredentialStatus()
      const integration = await readWmsIntegrationStatus()
      const rows = await sql`
        SELECT data_ref, coletado_em, total_registros, status, erro
        FROM wms_rateio_coletas
        ORDER BY data_ref DESC, coletado_em DESC
        LIMIT 1
      `

      return res.status(200).json({
        status: 'ok',
        credentials,
        integration,
        latestCollection: rows[0] || null,
      })
    } catch (error) {
      console.error('wms_settings_get_error', safeError(error))
      return res.status(500).json({
        status: 'error',
        message: 'Não foi possível carregar a configuração do WMS.',
      })
    }
  }

  if (req.method === 'POST') {
    try {
      const username = String(req.body?.username || '').trim()
      const password = String(req.body?.password || '')

      if (!username || !password) {
        return res.status(400).json({
          status: 'error',
          message: 'Informe o login e a senha do WMS.',
        })
      }

      if (username.length > 190 || password.length > 300) {
        return res.status(400).json({
          status: 'error',
          message: 'As credenciais informadas são inválidas.',
        })
      }

      await saveWmsCredentials({
        username,
        password,
        adminId: admin.id,
      })

      return res.status(200).json({
        status: 'ok',
        message: 'Credenciais do WMS salvas com segurança.',
        credentials: await getWmsCredentialStatus(),
      })
    } catch (error) {
      console.error('wms_settings_save_error', safeError(error))

      const keyError = String(error?.message || '').startsWith(
        'WMS_CREDENTIALS_KEY_',
      )

      return res.status(500).json({
        status: 'error',
        message: keyError
          ? 'A chave segura da integração WMS ainda não foi configurada.'
          : 'Não foi possível salvar as credenciais do WMS.',
      })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({
    status: 'error',
    message: 'Método não permitido.',
  })
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
        message: 'Apenas administradores podem acessar a integração WMS.',
      })
      return null
    }

    return usuario
  } catch (error) {
    console.error('wms_settings_auth_error', safeError(error))
    res.status(500).json({
      status: 'error',
      message: 'Não foi possível validar seu acesso.',
    })
    return null
  }
}

function safeError(error) {
  return {
    code: error?.code || null,
    message: error?.message || 'unknown',
  }
}
