import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import {
  FIVE_S_OPTIONS,
  currentBahiaDate,
  ensureActivitiesSchema,
  getActivityConfig,
  loadActivityBatch,
  optionMap5s,
  validImageData,
} from '../_lib/activities.js'

const ALLOWED_PROFILES = new Set(['AJUDANTE', 'ADM'])

export default async function handler(req, res) {
  const usuario = await requireActivitiesUser(req, res)
  if (!usuario) return

  try {
    await ensureActivitiesSchema()

    if (req.method === 'GET') {
      const config = await getActivityConfig('5s')
      if (!config?.ativo) {
        return res.status(404).json({ status: 'error', message: 'Atividade 5S indisponível.' })
      }

      const [people, recent] = await Promise.all([
        sql`
          SELECT id, nome, cpf, turno, perfil
          FROM usuarios
          WHERE status = 'ativo'
            AND id <> ${usuario.id}
          ORDER BY nome
        `,
        sql`
          SELECT DISTINCT l.id
          FROM atividade_lancamentos l
          INNER JOIN atividade_lancamento_participantes p ON p.lancamento_id = l.id
          WHERE l.atividade_chave = '5s'
            AND p.usuario_id = ${usuario.id}
          ORDER BY l.id DESC
          LIMIT 8
        `,
      ])

      const lancamentos = []
      for (const row of recent) {
        const batch = await loadActivityBatch(Number(row.id))
        if (batch) lancamentos.push(batch)
      }

      return res.status(200).json({
        status: 'ok',
        atividade: {
          chave: '5s',
          nome: '5S',
          valor_unitario: config.valor_unitario,
          exige_foto: true,
        },
        opcoes: FIVE_S_OPTIONS.map(([chave, nome]) => ({
          chave,
          nome,
          grupo: chave.startsWith('picking-') ? 'Picking' : 'Geral',
        })),
        usuarios: people.map((person) => ({
          id: Number(person.id),
          nome: person.nome,
          turno: person.turno || '',
          perfil: person.perfil || '',
        })),
        lancamentos,
      })
    }

    if (req.method === 'POST') {
      const payload = normalizePayload(req.body)
      const validation = validatePayload(payload)
      if (validation) {
        return res.status(400).json({ status: 'error', message: validation })
      }

      const config = await getActivityConfig('5s')
      if (!config?.ativo) {
        return res.status(404).json({ status: 'error', message: 'Atividade 5S indisponível.' })
      }

      const options = optionMap5s()
      const selectedKeys = [...new Set(payload.itens.map((item) => item.opcao_chave))]
      const selectedItems = selectedKeys.map((key) => ({
        opcao_chave: key,
        opcao_nome: options.get(key),
        evidencia_foto: payload.itens.find((item) => item.opcao_chave === key)?.evidencia_foto || '',
      }))

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

      const currentRows = await sql`
        SELECT id, nome, cpf, turno, perfil
        FROM usuarios
        WHERE id = ${usuario.id}
          AND status = 'ativo'
        LIMIT 1
      `
      const principal = currentRows[0]

      if (!principal) {
        return res.status(401).json({ status: 'error', message: 'Usuário não encontrado.' })
      }

      const helperIds = [...new Set(payload.ajudantes_usuario_ids)]
        .filter((id) => id > 0 && id !== usuario.id)

      const helpers = []
      for (const helperId of helperIds) {
        const rows = await sql`
          SELECT id, nome, cpf, turno, perfil
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

      const participantes = [
        { ...principal, papel: 'principal' },
        ...helpers.map((helper) => ({ ...helper, papel: 'ajudante' })),
      ]

      const dataAtividade = currentBahiaDate()

      // A duplicidade é verificada por pessoa + área + dia. Um lançamento reprovado
      // não bloqueia novo lançamento, repetindo a regra do sistema PHP anterior.
      for (const participant of participantes) {
        for (const item of selectedItems) {
          const duplicate = await sql`
            SELECT l.id
            FROM atividade_lancamentos l
            INNER JOIN atividade_lancamento_participantes p
              ON p.lancamento_id = l.id
            INNER JOIN atividade_lancamento_itens i
              ON i.lancamento_id = l.id
            WHERE l.atividade_chave = '5s'
              AND l.data_atividade = ${dataAtividade}
              AND l.status <> 'reprovado'
              AND p.usuario_id = ${participant.id}
              AND i.opcao_chave = ${item.opcao_chave}
            LIMIT 1
          `

          if (duplicate[0]) {
            return res.status(409).json({
              status: 'error',
              message:
                participant.papel === 'principal'
                  ? `Você já possui lançamento hoje para ${item.opcao_nome}.`
                  : `${participant.nome} já possui lançamento hoje para ${item.opcao_nome}.`,
            })
          }
        }
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
            status
          )
          VALUES (
            '5s',
            '5S',
            ${dataAtividade},
            ${principal.id},
            ${principal.nome},
            ${config.valor_unitario},
            ${payload.observacao || null},
            'pendente'
          )
          RETURNING id
        `

        lancamentoId = Number(inserted[0].id)

        for (const participant of participantes) {
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
              ${lancamentoId},
              ${participant.id},
              ${participant.nome},
              ${participant.cpf || null},
              ${participant.turno || null},
              ${participant.papel}
            )
          `
        }

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
              ${lancamentoId},
              ${item.opcao_chave},
              ${item.opcao_nome},
              ${config.valor_unitario},
              ${item.evidencia_foto}
            )
          `
        }
      } catch (error) {
        if (lancamentoId) {
          await sql`DELETE FROM atividade_lancamentos WHERE id = ${lancamentoId}`
        }
        throw error
      }

      const lancamento = await loadActivityBatch(lancamentoId)

      return res.status(201).json({
        status: 'ok',
        message: '5S enviado para aprovação.',
        lancamento,
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('activities_5s_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar o lançamento de 5S.',
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

    const profile = String(usuario.perfil || '').toUpperCase()
    if (!ALLOWED_PROFILES.has(profile)) {
      res.status(403).json({
        status: 'error',
        message: 'O módulo de atividades está disponível para Ajudantes e administradores.',
      })
      return null
    }

    return usuario
  } catch (error) {
    console.error('activities_5s_auth_error', error)
    res.status(500).json({ status: 'error', message: 'Não foi possível validar seu acesso.' })
    return null
  }
}

function normalizePayload(body = {}) {
  const rawItems = Array.isArray(body.itens) ? body.itens : []
  const rawHelpers = Array.isArray(body.ajudantes_usuario_ids)
    ? body.ajudantes_usuario_ids
    : []

  return {
    ajudantes_usuario_ids: rawHelpers
      .map((value) => Number(value))
      .filter(Number.isFinite),
    itens: rawItems.map((item) => ({
      opcao_chave: String(item?.opcao_chave || '').trim(),
      evidencia_foto: String(item?.evidencia_foto || '').trim(),
    })),
    observacao: String(body.observacao || '').trim().slice(0, 3000),
  }
}

function validatePayload(payload) {
  if (payload.itens.length === 0) return 'Selecione pelo menos uma área do 5S.'
  if (payload.itens.length > FIVE_S_OPTIONS.length) return 'Quantidade de áreas inválida.'
  if (payload.ajudantes_usuario_ids.length > 20) return 'Selecione no máximo 20 ajudantes.'
  return ''
}
