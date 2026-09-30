import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import { currentBahiaDate, ensureActivitiesSchema, getActivityConfig, loadActivityBatch, validImageData } from '../_lib/activities.js'

const ALLOWED_PROFILES = new Set(['AJUDANTE', 'ADM'])
const SKU_TYPES = [
  { chave: 'repack_gfa_vidro', nome: 'GFA VIDRO' },
  { chave: 'repack_lata', nome: 'LATA' },
  { chave: 'repack_long_neck', nome: 'LONG NECK' },
  { chave: 'repack_pet', nome: 'PET' },
  { chave: 'repack_destilado', nome: 'DESTILADO' },
  { chave: 'repack_agua', nome: 'ÁGUA' },
  { chave: 'repack_ow', nome: 'OW' },
  { chave: 'repack_bib', nome: 'BIB' },
]

export default async function handler(req, res) {
  const usuario = await requireUser(req, res)
  if (!usuario) return
  try {
    await ensureActivitiesSchema()
    if (req.method === 'GET') {
      const tipos = []
      for (const item of SKU_TYPES) {
        const config = await getActivityConfig(item.chave, usuario.id)
        if (config?.ativo) tipos.push({ ...item, valor_unitario: Number(config.valor_unitario || 0) })
      }
      const recent = await sql`
        SELECT DISTINCT l.id
        FROM atividade_lancamentos l
        INNER JOIN atividade_lancamento_participantes p ON p.lancamento_id = l.id
        WHERE l.atividade_chave LIKE 'repack_%' AND p.usuario_id = ${usuario.id}
        ORDER BY l.id DESC LIMIT 10
      `
      const lancamentos = []
      for (const row of recent) {
        const batch = await loadActivityBatch(Number(row.id))
        if (batch) lancamentos.push(batch)
      }
      return res.status(200).json({ status: 'ok', tipos, lancamentos })
    }
    if (req.method === 'POST') {
      const chave = String(req.body?.tipo_sku || '').trim().toLowerCase()
      const selectedType = SKU_TYPES.find((item) => item.chave === chave)
      const quantidadeCaixas = Math.max(0, Math.trunc(Number(req.body?.quantidade_caixas || 0)))
      const evidence = String(req.body?.evidencia_foto || '').trim()
      if (!selectedType) return res.status(400).json({ status: 'error', message: 'Selecione o tipo do SKU recuperado.' })
      if (quantidadeCaixas <= 0) return res.status(400).json({ status: 'error', message: 'Informe a quantidade em caixas.' })
      if (!validImageData(evidence)) return res.status(400).json({ status: 'error', message: 'Tire ou envie uma foto válida como evidência.' })

      const principalRows = await sql`
        SELECT id, nome, cpf, turno FROM usuarios
        WHERE id = ${usuario.id} AND status = 'ativo' LIMIT 1
      `
      const principal = principalRows[0]
      if (!principal) return res.status(401).json({ status: 'error', message: 'Usuário não encontrado.' })
      const participants = [{ ...principal, papel: 'principal' }]
      const principalConfig = await getActivityConfig(selectedType.chave, principal.id)
      if (!principalConfig?.ativo) return res.status(404).json({ status: 'error', message: 'Atividade indisponível.' })
      for (const participant of participants) {
        const config = await getActivityConfig(selectedType.chave, participant.id)
        participant.valor_unitario = Number(config?.valor_unitario ?? principalConfig.valor_unitario)
      }
      const details = {
        tipo_sku: selectedType.nome,
        quantidade_caixas: quantidadeCaixas,
        quantidade_calculo: quantidadeCaixas,
      }
      let lancamentoId = null
      try {
        const inserted = await sql`
          INSERT INTO atividade_lancamentos (
            atividade_chave, atividade_nome, data_atividade,
            usuario_criador_id, usuario_criador_nome,
            valor_unitario, observacao, detalhes, status
          )
          VALUES (
            ${selectedType.chave},
            ${'Repack - ' + selectedType.nome},
            ${currentBahiaDate()},
            ${principal.id},
            ${principal.nome},
            ${principalConfig.valor_unitario},
            ${`${quantidadeCaixas} caixa(s) • ${selectedType.nome}`},
            ${JSON.stringify(details)}::jsonb,
            'pendente'
          )
          RETURNING id
        `
        lancamentoId = Number(inserted[0].id)

        for (const participant of participants) {
          await sql`
            INSERT INTO atividade_lancamento_participantes (
              lancamento_id, usuario_id, usuario_nome, usuario_cpf,
              usuario_turno, papel, valor_unitario
            )
            VALUES (
              ${lancamentoId}, ${participant.id}, ${participant.nome},
              ${participant.cpf || null}, ${participant.turno || null},
              ${participant.papel}, ${participant.valor_unitario}
            )
          `
        }

        await sql`
          INSERT INTO atividade_lancamento_itens (
            lancamento_id, opcao_chave, opcao_nome, valor_unitario, evidencia_foto
          )
          VALUES (
            ${lancamentoId}, ${selectedType.chave}, ${selectedType.nome},
            ${principalConfig.valor_unitario}, ${evidence}
          )
        `
      } catch (error) {
        if (lancamentoId) await sql`DELETE FROM atividade_lancamentos WHERE id = ${lancamentoId}`
        throw error
      }

      return res.status(201).json({
        status: 'ok',
        message: 'Repack enviado para aprovação.',
        lancamento: await loadActivityBatch(lancamentoId),
      })
    }
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('activities_repack_error', error)
    return res.status(500).json({ status: 'error', message: 'Não foi possível processar o Repack.' })
  }
}

async function requireUser(req, res) {
  const usuario = await getSessionUser(req)
  if (!usuario) {
    res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
    return null
  }
  if (!ALLOWED_PROFILES.has(String(usuario.perfil || '').toUpperCase())) {
    res.status(403).json({ status: 'error', message: 'Atividade disponível para Ajudantes e administradores.' })
    return null
  }
  return usuario
}
