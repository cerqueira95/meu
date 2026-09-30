import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import {
  buildAdminDashboard,
  closeMonth,
  getIntegrationAlerts,
  getMonthClosure,
  isMonthClosed,
  listAuditLogs,
  listMonthClosures,
  logAdminAction,
  markMonthReviewed,
  reopenMonth,
} from '../_lib/remuneration-admin.js'
import {
  currentBahiaDate,
  fetchWmsItemReport,
  fetchWmsRateio,
  fetchWmsTasks,
  loginWms,
} from '../_lib/wms-client.js'
import { readWmsCredentials } from '../_lib/wms-secrets.js'
import {
  saveRateioCollection,
  saveRateioFailure,
} from '../_lib/wms-rateio.js'
import {
  saveItemCollection,
  saveItemFailure,
} from '../_lib/wms-item.js'
import {
  saveWmsTaskCollection,
  saveWmsTaskFailure,
} from '../_lib/wms-tasks.js'
import { calculateEscalonadaForDate } from '../_lib/escalonada.js'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    if (req.method === 'GET') {
      const mode = String(req.query?.mode || 'dashboard').trim().toLowerCase()

      if (mode === 'alerts') {
        const date = normalizeDate(req.query?.date) || currentBahiaDate()
        const alerts = await getIntegrationAlerts(date)
        return res.status(200).json({
          status: 'ok',
          date,
          alertas: alerts,
          total_pendencias: alerts.filter((item) => item.severity !== 'success').length,
        })
      }

      if (mode === 'audit') {
        const logs = await listAuditLogs(req.query?.limit)
        return res.status(200).json({
          status: 'ok',
          logs: logs.map(serializeAudit),
        })
      }

      if (mode === 'closures') {
        const fechamentos = await listMonthClosures()
        return res.status(200).json({
          status: 'ok',
          fechamentos: fechamentos.map(serializeClosure),
        })
      }

      const month = normalizeMonth(req.query?.mes) || currentBahiaDate().slice(0, 7)
      const [dashboard, alerts, closures] = await Promise.all([
        buildAdminDashboard(month),
        getIntegrationAlerts(currentBahiaDate()),
        listMonthClosures(),
      ])

      return res.status(200).json({
        status: 'ok',
        dashboard,
        alertas: alerts,
        fechamentos: closures.map(serializeClosure),
      })
    }

    if (req.method === 'POST') {
      const action = String(req.body?.action || '').trim().toLowerCase()

      if (action === 'conferir_mes') {
        const month = normalizeMonth(req.body?.mes)
        if (!month) return invalidMonth(res)
        const result = await markMonthReviewed(month, admin)
        return res.status(200).json({
          status: 'ok',
          message: `Mês ${month} marcado como conferido.`,
          fechamento: serializeClosure(result),
        })
      }

      if (action === 'fechar_mes') {
        const month = normalizeMonth(req.body?.mes)
        if (!month) return invalidMonth(res)
        const result = await closeMonth(month, admin)
        return res.status(200).json({
          status: 'ok',
          message: `Mês ${month} fechado. Os valores ficaram congelados no snapshot do fechamento.`,
          fechamento: serializeClosure(result),
        })
      }

      if (action === 'reabrir_mes') {
        const month = normalizeMonth(req.body?.mes)
        if (!month) return invalidMonth(res)
        const result = await reopenMonth(month, admin)
        return res.status(200).json({
          status: 'ok',
          message: `Mês ${month} reaberto para ajustes.`,
          fechamento: serializeClosure(result),
        })
      }

      if (action === 'reprocessar') {
        const date = normalizeDate(req.body?.data)
        const origem = String(req.body?.origem || 'ambos').trim().toLowerCase()

        if (!date) {
          return res.status(400).json({
            status: 'error',
            message: 'Informe uma data válida para reprocessar.',
          })
        }

        if (!['rateio', 'tarefas', 'ambos'].includes(origem)) {
          return res.status(400).json({
            status: 'error',
            message: 'Origem de reprocessamento inválida.',
          })
        }

        if (await isMonthClosed(date)) {
          return res.status(409).json({
            status: 'error',
            message: 'Este mês está fechado. Reabra o mês antes de reprocessar dados.',
          })
        }

        const result = await reprocessDate(date, origem)

        await logAdminAction(admin, {
          action: 'reprocessar_wms',
          entity: 'integracao_wms',
          entityId: date,
          description: `Reprocessamento de ${date} concluído para ${origem}.`,
          metadata: result,
        })

        return res.status(200).json({
          status: 'ok',
          message: `Reprocessamento de ${date} concluído sem duplicar os registros.`,
          resultado: result,
        })
      }

      return res.status(400).json({
        status: 'error',
        message: 'Ação administrativa inválida.',
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  } catch (error) {
    if (error?.code === 'MONTH_CLOSED') {
      return res.status(409).json({
        status: 'error',
        message: 'Este mês já está fechado.',
      })
    }

    console.error('remuneration_admin_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar a gestão da remuneração.',
    })
  }
}

async function reprocessDate(date, origem) {
  const credentials = await readWmsCredentials()

  if (!credentials) {
    const error = new Error('Credenciais WMS não configuradas.')
    error.code = 'WMS_CREDENTIALS_NOT_CONFIGURED'
    throw error
  }

  const token = await loginWms(credentials.username, credentials.password)
  const result = {
    data: date,
    origem,
    rateio: null,
    tarefas: null,
  }

  if (origem === 'rateio' || origem === 'ambos') {
    try {
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

      result.rateio = {
        registros: rateioSaved.count,
        itens: itemSaved.count,
        escalonada: escalonada.count,
      }
    } catch (error) {
      const message = error?.message || 'Falha ao reprocessar Rateio.'
      await Promise.allSettled([
        saveRateioFailure({ date, message }),
        saveItemFailure({ date, message }),
      ])
      throw error
    }
  }

  if (origem === 'tarefas' || origem === 'ambos') {
    try {
      const taskReport = await fetchWmsTasks(token, date)
      result.tarefas = await saveWmsTaskCollection({
        date,
        source: taskReport.source,
        rows: taskReport.rows,
      })
    } catch (error) {
      await saveWmsTaskFailure({
        date,
        message: error?.message || 'Falha ao reprocessar Monitorar Tarefas.',
      })
      throw error
    }
  }

  return result
}

async function requireAdmin(req, res) {
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
      message: 'Acesso restrito ao administrador.',
    })
    return null
  }

  return usuario
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function normalizeMonth(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}$/.test(text) ? text : null
}

function invalidMonth(res) {
  return res.status(400).json({
    status: 'error',
    message: 'Informe um mês válido.',
  })
}

function serializeClosure(row) {
  return {
    mes: row.mes,
    status: row.status || 'aberto',
    conferido_por_nome: row.conferido_por_nome || null,
    conferido_em: row.conferido_em || null,
    fechado_por_nome: row.fechado_por_nome || null,
    fechado_em: row.fechado_em || null,
    reaberto_por_nome: row.reaberto_por_nome || null,
    reaberto_em: row.reaberto_em || null,
    atualizado_em: row.atualizado_em || null,
  }
}

function serializeAudit(row) {
  return {
    id: Number(row.id),
    usuario_id: row.usuario_id ? Number(row.usuario_id) : null,
    usuario_nome: row.usuario_nome || 'Sistema',
    acao: row.acao,
    entidade: row.entidade,
    entidade_id: row.entidade_id || null,
    descricao: row.descricao || '',
    antes: row.antes || null,
    depois: row.depois || null,
    metadata: row.metadata || null,
    criado_em: row.criado_em,
  }
}
