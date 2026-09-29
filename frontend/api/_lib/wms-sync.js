import {
  readWmsCredentials,
  saveWmsIntegrationStatus,
} from './wms-secrets.js'
import {
  currentBahiaDate,
  fetchWmsItemReport,
  fetchWmsRateio,
  loginWms,
} from './wms-client.js'
import {
  saveRateioCollection,
  saveRateioFailure,
} from './wms-rateio.js'
import {
  saveItemCollection,
  saveItemFailure,
} from './wms-item.js'
import { calculateEscalonadaForDate } from './escalonada.js'

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

    const [rateioReport, itemReport] = await Promise.all([
      fetchWmsRateio(token, date),
      fetchWmsItemReport(token, date),
    ])

    const [rateioSaved, itemSaved] = await Promise.all([
      saveRateioCollection({
        date,
        source: rateioReport.source,
        rows: rateioReport.rows,
      }),
      saveItemCollection({
        date,
        source: itemReport.source,
        rows: itemReport.rows,
      }),
    ])

    const escalonada = await calculateEscalonadaForDate(date)

    await saveWmsIntegrationStatus({
      status: 'ok',
      message: 'Coleta do Rateio, WMS Item e escalonada concluída com sucesso.',
      checkedAt: new Date().toISOString(),
      count: rateioSaved.count,
    })

    return {
      date,
      count: rateioSaved.count,
      collectionId: rateioSaved.collectionId,
      itemCount: itemSaved.count,
      itemCollectionId: itemSaved.collectionId,
      escalonadaCount: escalonada.count,
      escalonadaLinkedUsers: escalonada.linkedUsers,
      escalonadaNotifications: escalonada.notifications,
      pickPackArea: escalonada.pickPackArea,
    }
  } catch (error) {
    const message = publicFailureMessage(error)

    try {
      await Promise.all([
        saveRateioFailure({ date, message }),
        saveItemFailure({ date, message }),
      ])
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

  if (error?.code === 'WMS_ITEM_FAILED') {
    return 'O WMS não respondeu ao relatório Tempo de Separação por Item.'
  }

  if (error?.code === 'WMS_CONTEXT_MISSING') {
    return 'Não foi possível identificar o usuário ou o armazém no WMS.'
  }

  return 'Falha inesperada durante a coleta automática do WMS.'
}
