import { getSessionUser } from '../_lib/session.js'
import { fetchWmsTasks, loginWms } from '../_lib/wms-client.js'
import { readWmsCredentials } from '../_lib/wms-secrets.js'
import {
  getOperatorTasksReport,
  saveOperatorTasks,
} from '../_lib/operator-tasks.js'
import { logAdminAction } from '../_lib/remuneration-admin.js'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    if (req.method === 'GET') {
      const from = normalizeDate(req.query?.from)
      const to = normalizeDate(req.query?.to)

      if (!from || !to) {
        return res.status(400).json({
          status: 'error',
          message: 'Informe a data inicial e final.',
        })
      }

      if (from > to) {
        return res.status(400).json({
          status: 'error',
          message: 'A data inicial não pode ser maior que a final.',
        })
      }

      const report = await getOperatorTasksReport(from, to)

      return res.status(200).json({
        status: 'ok',
        from,
        to,
        ...report,
      })
    }

    if (req.method === 'POST') {
      const date = normalizeDate(req.body?.data)

      if (!date) {
        return res.status(400).json({
          status: 'error',
          message: 'Informe uma data válida.',
        })
      }

      const credentials = await readWmsCredentials()

      if (!credentials) {
        return res.status(400).json({
          status: 'error',
          message: 'Credenciais WMS não configuradas.',
        })
      }

      const token = await loginWms(credentials.username, credentials.password)
      const report = await fetchWmsTasks(token, date)
      const saved = await saveOperatorTasks({
        date,
        rows: report.rows,
      })

      await logAdminAction(admin, {
        action: 'reprocessar_tarefas_operadores',
        entity: 'wms_operador_tarefas',
        entityId: date,
        description: `Tarefas dos operadores de ${date} atualizadas manualmente.`,
        metadata: saved,
      })

      return res.status(200).json({
        status: 'ok',
        message: `Tarefas dos operadores de ${date} atualizadas sem duplicar registros.`,
        resultado: saved,
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  } catch (error) {
    console.error('operator_tasks_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar as tarefas dos operadores.',
    })
  }
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
