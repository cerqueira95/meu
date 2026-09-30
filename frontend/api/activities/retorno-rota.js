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
const TYPES = [
  { chave: 'retorno_rota_molho_ag', nome: 'Molho AG' },
  { chave: 'retorno_rota_devolucao', nome: 'Devolução' },
  { chave: 'retorno_rota_troca', nome: 'Troca' },
  { chave: 'retorno_rota_chapatex', nome: 'Separação de Chapatex' },
]

export default async function handler(req, res) {
  const usuario = await requireActivitiesUser(req, res)
  if (!usuario) return

  try {
    await ensureActivitiesSchema()

    if (req.method === 'GET') {
      const users = await sql`
        SELECT id, nome, turno, perfil
        FROM usuarios
        WHERE status = 'ativo'
          AND id <> ${usuario.id}
        ORDER BY nome
      `

      const tipos = []
      for (const item of TYPES) {
        const config = await getActivityConfig(item.chave, usuario.id)
        if (config?.ativo) {
          tipos.push({
            ...item,
            valor_unitario: Number(config.valor_unitario || 0),
          })
        }
      }

      const recent = await sql`
        SELECT DISTINCT l.id
        FROM atividade_lancamentos l
        INNER JOIN atividade_lancamento_participantes p
          ON p.lancamento_id = l.id
        WHERE l.atividade_chave LIKE 'retorno_rota_%'
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
        tipos,
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
      const tipoChave = String(req.body?.tipo_atividade || '').trim().toLowerCase()
      const selectedType = TYPES.find((item) => item.chave === tipoChave)
      const helperIds = Array.isArray(req.body?.ajudantes_usuario_ids)
        ? [...new Set(
            req.body.ajudantes_usuario_ids
              .map(Number)
              .filter((id) => Number.isInteger(id) && id > 0),
          )]
        : []
      const evidence = String(req.body?.evidencia_foto || '').trim()

      if (!selectedType) {
        return res.status(400).json({
          status: 'error',
          message: 'Selecione uma atividade válida.',
        })
      }

      if (helperIds.length > 20) {
        return res.status(400).json({
          status: 'error',
          message: 'Selecione no máximo 20 ajudantes.',
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
        return res.status(401).json({
          status: 'error',
          message: 'Usuário não encontrado.',
        })
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

      const principalConfig = await getActivityConfig(selectedType.chave, principal.id)
      if (!principalConfig?.ativo) {
        return res.status(404).json({
          status: 'error',
          message: 'Atividade indisponível.',
        })
      }

      for (const participant of participants) {
        const config = await getActivityConfig(selectedType.chave, participant.id)
        participant.valor_unitario = Number(
          config?.valor_unitario ?? principalConfig.valor_unitario,
        )
      }

      const dataAtividade = currentBahiaDate()

      for (const participant of participants) {
        const duplicate = await sql`
          SELECT l.id
          FROM atividade_lancamentos l
          INNER JOIN atividade_lancamento_participantes p
            ON p.lancamento_id = l.id
          WHERE l.atividade_chave = ${selectedType.chave}
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
        grupo: 'Retorno de Rota',
        tipo_atividade: selectedType.chave,
        tipo_atividade_nome: selectedType.nome,
        quantidade_calculo: 1,
        quantidade_ajudantes: helpers.length,
        ajudantes_nomes: helpers.map((helper) => helper.nome),
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
            ${selectedType.chave},
            ${`Retorno de Rota - ${selectedType.nome}`},
            ${dataAtividade},
            ${principal.id},
            ${principal.nome},
            ${principalConfig.valor_unitario},
            ${helpers.length ? `Ajudantes: ${helpers.map((helper) => helper.nome).join(', ')}` : 'Sem ajudantes'},
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
            ${selectedType.chave},
            ${selectedType.nome},
            ${principalConfig.valor_unitario},
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
          ? 'Retorno de Rota enviado para aprovação para todos os participantes.'
          : 'Retorno de Rota enviado para aprovação.',
        lancamento: await loadActivityBatch(lancamentoId),
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('activities_retorno_rota_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar o lançamento de Retorno de Rota.',
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
    console.error('activities_retorno_rota_auth_error', error)
    res.status(500).json({
      status: 'error',
      message: 'Não foi possível validar seu acesso.',
    })
    return null
  }
}
