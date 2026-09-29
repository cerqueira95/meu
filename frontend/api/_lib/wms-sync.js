import {
  readWmsCredentials,
  saveWmsIntegrationStatus,
} from './wms-secrets.js'
import {
  currentBahiaDate,
  fetchWmsRateio,
  loginWms,
} from './wms-client.js'
import {
  saveRateioCollection,
  saveRateioFailure,
} from './wms-rateio.js'

export async function collectCurrentRateio() {
  const date = currentBahiaDate()
  const credentials = await readWmsCredentials()

  if (!credentials) {
    const error = new Error('Credenciais WMS não configuradas.')
    error.code = 'WMS_CREDENTIALS_NOT_CONFIGURED'
    throw error
  }

  try {
    const token = await loginWms(
      credentials.username,
      credentials.password,
    )
    const report = await fetchWmsRateio(token, date)
    const saved = await saveRateioCollection({
      date,
      source: report.source,
      rows: report.rows,
    })

    await saveWmsIntegrationStatus({
      status: 'ok',
      message: 'Coleta do rateio concluída com sucesso.',
      checkedAt: new Date().toISOString(),
      count: saved.count,
    })

    return {
      date,
      count: saved.count,
      collectionId: saved.collectionId,
    }
  } catch (error) {
    const message = publicFailureMessage(error)

    try {
      await saveRateioFailure({ date, message })
      await saveWmsIntegrationStatus({
        status: 'error',
        message,
        checkedAt: new Date().toISOString(),
        count: 0,
      })
    } catch {
      // Mantém o erro original como causa principal da execução.
    }

    throw error
  }
}

export function publicFailureMessage(error) {
  if (error?.code === 'WMS_CREDENTIALS_NOT_CONFIGURED') {
    return 'Credenciais WMS ainda não configuradas.'
  }

  if (error?.code === 'WMS_AUTH_FAILED') {
    return 'Login ou senha recusados pelo WMS.'
  }

  if (error?.code === 'WMS_TOKEN_MISSING') {
    return 'O WMS não retornou o token de autenticação esperado.'
  }

  if (error?.code === 'WMS_TOKEN_REJECTED') {
    return 'O WMS recusou o token durante a consulta do relatório.'
  }

  if (error?.code === 'WMS_RATEIO_FAILED') {
    return 'O WMS não respondeu ao Relatório de Rateio.'
  }

  return 'Falha inesperada durante a coleta automática do WMS.'
}
