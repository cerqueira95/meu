import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import {
  currentBahiaDate,
  ensureActivitiesSchema,
  getActivityConfig,
  loadActivityBatch,
  validImageData,
} from '../_lib/activities.js'

const ALLOWED_PROFILES = new Set(['AJUDANTE', 'ADM'])
const KEY = 'integralizacao_devolucao'

export default async function handler(req, res) {
  const usuario = await requireActivitiesUser(req, res)
  if (!usuario) return

  try {
    await ensureActivitiesSchema()
    const config = await getActivityConfig(KEY, usuario.id)

    if (!config?.ativo) {
      return res.status(404).json({ status: 'error', message: 'Atividade indisponível.' })
    }
    if (req.method === 'GET') {
      const users = await sql`
        SELECT id, nome, turno, perfil
        FROM usuarios
        WHERE status = 'ativo'
          AND id <> ${usuario.id}
        ORDER BY nome
      `

      const recent = await sql`
        SELECT DISTINCT l.id
        FROM atividade_lancamentos l
        INNER JOIN atividade_lancamento_participantes p
          ON p.lancamento_id = l.id
        WHERE l.atividade_chave = ${KEY}
          AND p.usuario_id = ${usuario.id}
        ORDER BY l.id DESC
        LIMIT 10
      `

      const lancamentos = []
      for (const row of recent) {
        const batch = await loadActivityBatch(Number(row.id))
        if (batch) lancamentos.push(batch)
      }
      return res.status(200).json({
        status: 'ok',
        atividade: config,
        usuarios: users.map((person) => ({
          id: Number(person.id),
          nome: person.nome,
          turno: person.turno || '',
          perfil: person.perfil || '',
        })),
        lancamentos,
      })
    }

    if (req.method === 'POST') {
      const helperIds = Array.isArray(req.body?.ajudantes_usuario_ids)
        ? [...new Set(req.body.ajudantes_usuario_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
        : []
      const integralizacao100 = req.body?.integralizacao_100 !== false
      const motivo = String(req.body?.motivo_nao_integralizado || '').trim().slice(0, 2000)
      const evidence = String(req.body?.evidencia_foto || '').trim()

      if (helperIds.length > 20) {
        return res.status(400).json({ status: 'error', message: 'Selecione no máximo 20 ajudantes.' })
      }
      if (!integralizacao100 && !motivo) {
        return res.status(400).json({
          status: 'error',
          message: 'Informe o motivo quando não conseguir integralizar 100%.',
        })
      }

      if (!validImageData(evidence)) {
        return res.status(400).json({
          status: 'error',
          message: 'Tire ou envie uma foto válida como evidência.',
        })
      }

      const principalRows = await sql`
        SELECT id, nome, cpf, turno
        FROM usuarios
        WHERE id = ${usuario.id}
          AND status = 'ativo'
        LIMIT 1
      `
      const principal = principalRows[0]

      if (!principal) {
        return res.status(401).json({ status: 'error', message: 'Usuário não encontrado.' })
      }
      const helpers = []
      for (const helperId of helperIds) {
        if (helperId === Number(usuario.id)) continue

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

      const participants = [
        { ...principal, papel: 'principal' },
        ...helpers.map((helper) => ({ ...helper, papel: 'ajudante' })),
      ]
      for (const participant of participants) {
        const participantConfig = await getActivityConfig(KEY, participant.id)
        participant.valor_unitario = Number(participantConfig?.valor_unitario ?? config.valor_unitario)
      }

      const dataAtividade = currentBahiaDate()

      for (const participant of participants) {
        const duplicate = await sql`
          SELECT l.id
          FROM atividade_lancamentos l
          INNER JOIN atividade_lancamento_participantes p
            ON p.lancamento_id = l.id
          WHERE l.atividade_chave = ${KEY}
            AND l.data_atividade = ${dataAtividade}
            AND l.status <> 'reprovado'
            AND p.usuario_id = ${participant.id}
          LIMIT 1
        `

        if (duplicate[0]) {
          return res.status(409).json({
            status: 'error',
            message: participant.papel === 'principal'
              ? 'Você já possui lançamento hoje para essa atividade.'
              : `${participant.nome} já possui lançamento hoje para essa atividade.`,
          })
        }
      }
      const details = {
        integralizacao_100: integralizacao100,
        motivo_nao_integralizado: integralizacao100 ? null : motivo,
        quantidade_ajudantes: helpers.length,
        ajudantes_nomes: helpers.map((helper) => helper.nome),
        quantidade_calculo: integralizacao100 ? 1 : 0.5,
      }

      let lancamentoId = null
      try {
        const inserted = await sql`
          INSERT INTO atividade_lancamentos (
            atividade_chave,
            atividade_nome,
            data_atividade,
            usuario_criador_id,
            usuario_criador_nome,
            valor_unitario,
            observacao,
            detalhes,
            status
          )
          VALUES (
            ${KEY},
            'Integralização da Devolução',
            ${dataAtividade},
            ${principal.id},
            ${principal.nome},
            ${config.valor_unitario},
            ${integralizacao100 ? 'Integralização 100%' : `Não integralizou 100% | Motivo: ${motivo}`},
            ${JSON.stringify(details)}::jsonb,
            'pendente'
          )
          RETURNING id
        `
        lancamentoId = Number(inserted[0].id)
        for (const participant of participants) {
          await sql`
            INSERT INTO atividade_lancamento_participantes (
              lancamento_id,
              usuario_id,
              usuario_nome,
              usuario_cpf,
              usuario_turno,
              papel,
              valor_unitario
            )
            VALUES (
              ${lancamentoId},
              ${participant.id},
              ${participant.nome},
              ${participant.cpf || null},
              ${participant.turno || null},
              ${participant.papel},
              ${participant.valor_unitario}
            )
          `
        }

        await sql`
          INSERT INTO atividade_lancamento_itens (
            lancamento_id,
            opcao_chave,
            opcao_nome,
            valor_unitario,
            evidencia_foto
          )
          VALUES (
            ${lancamentoId},
            'integralizacao',
            'Integralização da Devolução',
            ${config.valor_unitario},
            ${evidence}
          )
        `
      } catch (error) {
        if (lancamentoId) {
          await sql`DELETE FROM atividade_lancamentos WHERE id = ${lancamentoId}`
        }
        throw error
      }

      return res.status(201).json({
        status: 'ok',
        message: helpers.length
          ? 'Integralização enviada para aprovação para todos os participantes.'
          : 'Integralização enviada para aprovação.',
        lancamento: await loadActivityBatch(lancamentoId),
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('activities_integralizacao_devolucao_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar a Integralização da Devolução.',
    })
  }
}
async function requireActivitiesUser(req, res) {
  try {
    const usuario = await getSessionUser(req)
    if (!usuario) {
      res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
      return null
    }

    if (!ALLOWED_PROFILES.has(String(usuario.perfil || '').toUpperCase())) {
      res.status(403).json({
        status: 'error',
        message: 'O módulo de atividades está disponível para Ajudantes e administradores.',
      })
      return null
    }

    return usuario
  } catch (error) {
    console.error('activities_integralizacao_devolucao_auth_error', error)
    res.status(500).json({ status: 'error', message: 'Não foi possível validar seu acesso.' })
    return null
  }
}
