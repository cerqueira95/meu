import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import {
  FIVE_S_UNIT_VALUE,
  currentBahiaDate,
  ensureActivitiesSchema,
  loadActivityBatch,
  optionMap5s,
  validImageData,
} from '../_lib/activities.js'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    await ensureActivitiesSchema()

    if (req.method === 'GET') {
      const requestedStatus = String(req.query?.status || 'pendente').trim().toLowerCase()
      const status = ['pendente', 'aprovado', 'reprovado', 'todos'].includes(requestedStatus)
        ? requestedStatus
        : 'pendente'

      const rows = status === 'todos'
        ? await sql`
            SELECT id
            FROM atividade_lancamentos
            ORDER BY
              CASE WHEN status = 'pendente' THEN 0 ELSE 1 END,
              data_atividade DESC,
              criado_em DESC
            LIMIT 200
          `
        : await sql`
            SELECT id
            FROM atividade_lancamentos
            WHERE status = ${status}
            ORDER BY data_atividade DESC, criado_em DESC
            LIMIT 200
          `

      const lancamentos = []
      for (const row of rows) {
        const batch = await loadActivityBatch(Number(row.id))
        if (batch) lancamentos.push(batch)
      }

      const summaryRows = await sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendentes,
          COUNT(*) FILTER (WHERE status = 'aprovado')::int AS aprovados,
          COUNT(*) FILTER (WHERE status = 'reprovado')::int AS reprovados
        FROM atividade_lancamentos
      `

      return res.status(200).json({
        status: 'ok',
        resumo: summaryRows[0] || { pendentes: 0, aprovados: 0, reprovados: 0 },
        lancamentos,
      })
    }

    if (req.method === 'POST') {
      const action = String(req.body?.action || '').trim().toLowerCase()
      const id = Number(req.body?.id)

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ status: 'error', message: 'Lançamento inválido.' })
      }

      const current = await loadActivityBatch(id)
      if (!current) {
        return res.status(404).json({ status: 'error', message: 'Lançamento não encontrado.' })
      }

      if (action === 'aprovar') {
        if (current.status !== 'pendente') {
          return res.status(409).json({
            status: 'error',
            message: 'Somente lançamentos pendentes podem ser aprovados.',
          })
        }

        await sql`
          UPDATE atividade_lancamentos
          SET status = 'aprovado',
              motivo_reprovacao = NULL,
              aprovado_por_id = ${admin.id},
              aprovado_por_nome = ${admin.nome},
              aprovado_em = NOW(),
              reprovado_por_id = NULL,
              reprovado_por_nome = NULL,
              reprovado_em = NULL,
              atualizado_em = NOW()
          WHERE id = ${id}
        `

        return res.status(200).json({
          status: 'ok',
          message: 'Atividade aprovada para todos os participantes.',
          lancamento: await loadActivityBatch(id),
        })
      }

      if (action === 'reprovar') {
        if (current.status !== 'pendente') {
          return res.status(409).json({
            status: 'error',
            message: 'Somente lançamentos pendentes podem ser reprovados.',
          })
        }

        const motivo = String(req.body?.motivo || '').trim().slice(0, 2000)
        if (!motivo) {
          return res.status(400).json({
            status: 'error',
            message: 'Informe o motivo da reprovação.',
          })
        }

        await sql`
          UPDATE atividade_lancamentos
          SET status = 'reprovado',
              motivo_reprovacao = ${motivo},
              reprovado_por_id = ${admin.id},
              reprovado_por_nome = ${admin.nome},
              reprovado_em = NOW(),
              aprovado_por_id = NULL,
              aprovado_por_nome = NULL,
              aprovado_em = NULL,
              atualizado_em = NOW()
          WHERE id = ${id}
        `

        return res.status(200).json({
          status: 'ok',
          message: 'Atividade reprovada para todos os participantes.',
          lancamento: await loadActivityBatch(id),
        })
      }

      if (action === 'editar') {
        if (current.status !== 'pendente') {
          return res.status(409).json({
            status: 'error',
            message: 'Somente lançamentos pendentes podem ser editados.',
          })
        }

        if (current.atividade_chave !== '5s') {
          return res.status(400).json({
            status: 'error',
            message: 'A edição deste tipo de atividade ainda não está disponível.',
          })
        }

        const payload = normalizeEditPayload(req.body)
        const validation = validateEditPayload(payload)
        if (validation) {
          return res.status(400).json({ status: 'error', message: validation })
        }

        const options = optionMap5s()
        const selectedKeys = [...new Set(payload.itens.map((item) => item.opcao_chave))]
        const existingByKey = new Map(current.itens.map((item) => [item.opcao_chave, item]))

        const selectedItems = selectedKeys.map((key) => {
          const incoming = payload.itens.find((item) => item.opcao_chave === key)
          const existing = existingByKey.get(key)
          return {
            opcao_chave: key,
            opcao_nome: options.get(key),
            evidencia_foto: incoming?.evidencia_foto || existing?.evidencia_foto || '',
          }
        })

        if (selectedItems.some((item) => !item.opcao_nome)) {
          return res.status(400).json({
            status: 'error',
            message: 'Uma ou mais áreas selecionadas não são válidas.',
          })
        }

        for (const item of selectedItems) {
          if (!validImageData(item.evidencia_foto)) {
            return res.status(400).json({
              status: 'error',
              message: `Envie uma foto válida para a área ${item.opcao_nome}.`,
            })
          }
        }

        const principal = current.participantes.find((person) => person.papel === 'principal')
        if (!principal) {
          return res.status(409).json({
            status: 'error',
            message: 'O lançamento não possui participante principal.',
          })
        }

        const helperIds = [...new Set(payload.ajudantes_usuario_ids)]
          .filter((helperId) => helperId > 0 && helperId !== principal.usuario_id)

        const helpers = []
        for (const helperId of helperIds) {
          const rows = await sql`
            SELECT id, nome, cpf, turno
            FROM usuarios
            WHERE id = ${helperId}
              AND status = 'ativo'
            LIMIT 1
          `
          if (!rows[0]) {
            return res.status(400).json({
              status: 'error',
              message: 'Um dos ajudantes selecionados não foi encontrado ou está inativo.',
            })
          }
          helpers.push(rows[0])
        }

        const participantsForValidation = [
          {
            id: principal.usuario_id,
            nome: principal.usuario_nome,
          },
          ...helpers.map((helper) => ({
            id: Number(helper.id),
            nome: helper.nome,
          })),
        ]

        for (const participant of participantsForValidation) {
          for (const item of selectedItems) {
            const duplicate = await sql`
              SELECT l.id
              FROM atividade_lancamentos l
              INNER JOIN atividade_lancamento_participantes p
                ON p.lancamento_id = l.id
              INNER JOIN atividade_lancamento_itens i
                ON i.lancamento_id = l.id
              WHERE l.id <> ${id}
                AND l.atividade_chave = '5s'
                AND l.data_atividade = ${current.data_atividade || currentBahiaDate()}
                AND l.status <> 'reprovado'
                AND p.usuario_id = ${participant.id}
                AND i.opcao_chave = ${item.opcao_chave}
              LIMIT 1
            `

            if (duplicate[0]) {
              return res.status(409).json({
                status: 'error',
                message: `${participant.nome} já possui outro lançamento nesta data para ${item.opcao_nome}.`,
              })
            }
          }
        }

        await sql`
          UPDATE atividade_lancamentos
          SET observacao = ${payload.observacao || null},
              valor_unitario = ${FIVE_S_UNIT_VALUE},
              atualizado_em = NOW()
          WHERE id = ${id}
        `

        await sql`
          DELETE FROM atividade_lancamento_participantes
          WHERE lancamento_id = ${id}
            AND papel <> 'principal'
        `

        for (const helper of helpers) {
          await sql`
            INSERT INTO atividade_lancamento_participantes (
              lancamento_id,
              usuario_id,
              usuario_nome,
              usuario_cpf,
              usuario_turno,
              papel
            )
            VALUES (
              ${id},
              ${helper.id},
              ${helper.nome},
              ${helper.cpf || null},
              ${helper.turno || null},
              'ajudante'
            )
          `
        }

        await sql`DELETE FROM atividade_lancamento_itens WHERE lancamento_id = ${id}`

        for (const item of selectedItems) {
          await sql`
            INSERT INTO atividade_lancamento_itens (
              lancamento_id,
              opcao_chave,
              opcao_nome,
              valor_unitario,
              evidencia_foto
            )
            VALUES (
              ${id},
              ${item.opcao_chave},
              ${item.opcao_nome},
              ${FIVE_S_UNIT_VALUE},
              ${item.evidencia_foto}
            )
          `
        }

        return res.status(200).json({
          status: 'ok',
          message: 'Lançamento atualizado.',
          lancamento: await loadActivityBatch(id),
        })
      }

      return res.status(400).json({
        status: 'error',
        message: 'Ação inválida.',
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('activities_admin_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar a gestão de atividades.',
    })
  }
}

async function requireAdmin(req, res) {
  try {
    const usuario = await getSessionUser(req)

    if (!usuario) {
      res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
      return null
    }

    if (String(usuario.perfil || '').toUpperCase() !== 'ADM') {
      res.status(403).json({
        status: 'error',
        message: 'Apenas administradores podem aprovar atividades.',
      })
      return null
    }

    return usuario
  } catch (error) {
    console.error('activities_admin_auth_error', error)
    res.status(500).json({ status: 'error', message: 'Não foi possível validar seu acesso.' })
    return null
  }
}

function normalizeEditPayload(body = {}) {
  return {
    ajudantes_usuario_ids: Array.isArray(body.ajudantes_usuario_ids)
      ? body.ajudantes_usuario_ids.map(Number).filter(Number.isFinite)
      : [],
    itens: Array.isArray(body.itens)
      ? body.itens.map((item) => ({
          opcao_chave: String(item?.opcao_chave || '').trim(),
          evidencia_foto: String(item?.evidencia_foto || '').trim(),
        }))
      : [],
    observacao: String(body.observacao || '').trim().slice(0, 3000),
  }
}

function validateEditPayload(payload) {
  if (payload.itens.length === 0) return 'O lançamento precisa ter pelo menos uma área.'
  if (payload.ajudantes_usuario_ids.length > 20) return 'Selecione no máximo 20 ajudantes.'
  return ''
}
