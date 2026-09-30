import { getSessionUser } from '../_lib/session.js'
import { logAdminAction } from '../_lib/remuneration-admin.js'
import {
  listWmsTaskConfigs,
  updateWmsTaskValue,
} from '../_lib/wms-tasks.js'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    if (req.method === 'GET') {
      const tarefas = await listWmsTaskConfigs()

      return res.status(200).json({
        status: 'ok',
        tarefas,
      })
    }

    if (req.method === 'POST') {
      const chave = String(req.body?.chave || '').trim()
      const valor = Number(req.body?.valor_unitario)

      if (!chave) {
        return res.status(400).json({
          status: 'error',
          message: 'Tarefa WMS inválida.',
        })
      }

      if (!Number.isFinite(valor) || valor < 0 || valor > 100000) {
        return res.status(400).json({
          status: 'error',
          message: 'Informe um valor válido.',
        })
      }

      const tarefa = await updateWmsTaskValue({ chave, valor })
      if (!tarefa) {
        return res.status(404).json({
          status: 'error',
          message: 'Tarefa WMS não encontrada.',
        })
      }

      await logAdminAction(admin, {
        action: 'alterar_valor_tarefa_wms',
        entity: 'wms_tarefa_valor',
        entityId: tarefa.chave,
        description: `Valor da tarefa WMS ${tarefa.nome} alterado para R$ ${valor.toFixed(2)}.`,
        after: { valor_unitario: valor },
      })

      return res.status(200).json({
        status: 'ok',
        message: 'Valor da tarefa WMS atualizado.',
        tarefa,
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  } catch (error) {
    console.error('wms_task_values_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível carregar os valores das tarefas WMS.',
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
      message: 'Apenas administradores podem editar valores das tarefas WMS.',
    })
    return null
  }

  return usuario
}
