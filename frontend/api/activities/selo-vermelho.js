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
const EMBALAGENS = ['PET', 'LATA', 'LONG NECK', 'RGB', 'BAG BOX']
const MOTIVOS = [
  'VAZAMENTO',
  'EMBALAGEM COM FUROS',
  'EMBALAGEM MOLHADA',
  'COR ALTERADO',
  'FALTA DE PRODUTO',
  'EMBALAGEM MURCHA',
  'PALLET QUEBRADO',
  'OUTROS',
]

export default async function handler(req, res) {
  const usuario = await requireActivitiesUser(req, res)
  if (!usuario) return

  try {
    await ensureActivitiesSchema()
    const config = await getActivityConfig('selo_vermelho', usuario.id)
    if (!config?.ativo) {
      return res.status(404).json({ status: 'error', message: 'Atividade Selo Vermelho indisponível.' })
    }

    if (req.method === 'GET') {
      const recent = await sql`
        SELECT DISTINCT l.id
        FROM atividade_lancamentos l
        INNER JOIN atividade_lancamento_participantes p ON p.lancamento_id = l.id
        WHERE l.atividade_chave = 'selo_vermelho'
          AND p.usuario_id = ${usuario.id}
        ORDER BY l.id DESC
        LIMIT 8
      `

      const lancamentos = []
      for (const row of recent) {
        const batch = await loadActivityBatch(Number(row.id))
        if (batch) lancamentos.push(batch)
      }

      return res.status(200).json({
        status: 'ok',
        atividade: config,
        embalagens: EMBALAGENS,
        motivos: MOTIVOS,
        lancamentos,
      })
    }

    if (req.method === 'POST') {
      const itens = normalizeItems(req.body?.itens)
      const evidenciaFoto = String(req.body?.evidencia_foto || '').trim()

      if (!itens.length) {
        return res.status(400).json({ status: 'error', message: 'Adicione pelo menos um item retrabalhado.' })
      }

      for (let index = 0; index < itens.length; index += 1) {
        const item = itens[index]
        if (!EMBALAGENS.includes(item.embalagem)) {
          return res.status(400).json({ status: 'error', message: `Selecione a embalagem do item ${index + 1}.` })
        }
        if (item.quantidade_plts <= 0) {
          return res.status(400).json({ status: 'error', message: `Informe a quantidade de PLTs do item ${index + 1}.` })
        }
        if (!MOTIVOS.includes(item.motivo_anomalia)) {
          return res.status(400).json({ status: 'error', message: `Selecione o motivo do item ${index + 1}.` })
        }
        if (item.motivo_anomalia === 'OUTROS' && !item.motivo_outros) {
          return res.status(400).json({ status: 'error', message: `Descreva o motivo do item ${index + 1}.` })
        }
      }

      if (!validImageData(evidenciaFoto)) {
        return res.status(400).json({ status: 'error', message: 'Tire ou envie uma foto válida como evidência.' })
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

      const totalPlts = itens.reduce((sum, item) => sum + item.quantidade_plts, 0)
      const detalhes = {
        quantidade_calculo: totalPlts,
        total_plts: totalPlts,
        itens,
      }
      const observacao = itens
        .map((item, index) => {
          const detalhe = item.motivo_outros ? ` • ${item.motivo_outros}` : ''
          return `Item ${index + 1}: ${item.embalagem} • ${item.quantidade_plts} PLT(s) • ${item.motivo_anomalia}${detalhe}`
        })
        .join('\n')

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
            'selo_vermelho',
            'Selo Vermelho',
            ${currentBahiaDate()},
            ${principal.id},
            ${principal.nome},
            ${config.valor_unitario},
            ${observacao},
            ${JSON.stringify(detalhes)}::jsonb,
            'pendente'
          )
          RETURNING id
        `
        lancamentoId = Number(inserted[0].id)

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
            ${principal.id},
            ${principal.nome},
            ${principal.cpf || null},
            ${principal.turno || null},
            'principal',
            ${config.valor_unitario}
          )
        `

        for (let index = 0; index < itens.length; index += 1) {
          const item = itens[index]
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
              ${`item-${index + 1}-${item.embalagem.toLowerCase().replace(/\s+/g, '-')}`},
              ${`${item.embalagem} • ${item.quantidade_plts} PLT(s) • ${item.motivo_anomalia}`},
              ${config.valor_unitario},
              ${evidenciaFoto}
            )
          `
        }
      } catch (error) {
        if (lancamentoId) {
          await sql`DELETE FROM atividade_lancamentos WHERE id = ${lancamentoId}`
        }
        throw error
      }

      return res.status(201).json({
        status: 'ok',
        message: 'Selo Vermelho enviado para aprovação.',
        lancamento: await loadActivityBatch(lancamentoId),
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('activities_selo_vermelho_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar o lançamento de Selo Vermelho.',
    })
  }
}

function normalizeItems(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).map((item) => ({
    embalagem: String(item?.embalagem || '').trim().toUpperCase(),
    quantidade_plts: Math.max(0, Math.trunc(Number(item?.quantidade_plts || 0))),
    motivo_anomalia: String(item?.motivo_anomalia || '').trim().toUpperCase(),
    motivo_outros: String(item?.motivo_outros || '').trim().slice(0, 1200),
  }))
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
    console.error('activities_selo_vermelho_auth_error', error)
    res.status(500).json({ status: 'error', message: 'Não foi possível validar seu acesso.' })
    return null
  }
}
