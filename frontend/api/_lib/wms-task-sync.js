import {
  readWmsCredentials,
} from './wms-secrets.js'
import {
  currentBahiaDate,
  fetchWmsTasks,
  loginWms,
} from './wms-client.js'
import {
  previousIsoDate,
  saveWmsTaskCollection,
  saveWmsTaskFailure,
} from './wms-tasks.js'

export async function collectWmsTasksD1D0() {
  const today = currentBahiaDate()
  const dates = [previousIsoDate(today), today]
  const credentials = await readWmsCredentials()

  if (!credentials) {
    const error = new Error('Credenciais WMS não configuradas.')
    error.code = 'WMS_CREDENTIALS_NOT_CONFIGURED'
    throw error
  }

  const token = await loginWms(
    credentials.username,
    credentials.password,
  )

  const results = []

  for (const date of dates) {
    try {
      const report = await fetchWmsTasks(token, date)
      const saved = await saveWmsTaskCollection({
        date,
        source: report.source,
        rows: report.rows,
      })
      results.push(saved)
    } catch (error) {
      try {
        await saveWmsTaskFailure({
          date,
          message: publicWmsTaskFailureMessage(error),
        })
      } catch {
        // Preserva o erro original como causa principal.
      }
      throw error
    }
  }

  return {
    today,
    dates,
    results,
    totalCompleted: results.reduce((sum, item) => sum + Number(item.completed || 0), 0),
    totalLinked: results.reduce((sum, item) => sum + Number(item.linked || 0), 0),
    totalWithoutUser: results.reduce((sum, item) => sum + Number(item.withoutUser || 0), 0),
    totalWithoutValue: results.reduce((sum, item) => sum + Number(item.withoutValue || 0), 0),
  }
}

export function publicWmsTaskFailureMessage(error) {
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
    return 'O WMS recusou o token durante a consulta do Monitorar Tarefas.'
  }

  if (error?.code === 'WMS_TASK_FAILED') {
    return 'O WMS não respondeu ao Monitorar Tarefas.'
  }

  return 'Falha inesperada durante a coleta das tarefas WMS.'
}
