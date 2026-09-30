import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import {
  currentBahiaDate,
  ensureActivitiesSchema,
  getActivityConfig,
  listActivityConfigs,
  loadActivityBatch,
  validImageData,
} from '../_lib/activities.js'

const ALLOWED_PROFILES = new Set(['AJUDANTE', 'ADM'])

const SEPARATION_TYPES = [
  { chave: 'separacao_marketing', nome: 'Marketing', tipo_calculo: 'fixo', exige_mapa: true, exige_placa: true },
  { chave: 'separacao_shelf_life', nome: 'Despejo', tipo_calculo: 'fixo' },
  { chave: 'separacao_armazenagem_chopp', nome: 'Armazenagem de CHOPP', tipo_calculo: 'fixo' },
  { chave: 'separacao_chopp', nome: 'Separação de CHOPP', tipo_calculo: 'fixo' },
  { chave: 'separacao_triagem_repack', nome: 'Triagem Repack', tipo_calculo: 'por_plt' },
  { chave: 'separacao_pre_picking', nome: 'Pré-Picking', tipo_calculo: 'fixo' },
  { chave: 'separacao_transferencia', nome: 'Separação de Transferência', tipo_calculo: 'fixo' },
]

export default async function handler(req, res) {
  const usuario = await requireActivitiesUser(req, res)
  if (!usuario) return

  try {
    await ensureActivitiesSchema()

    if (req.method === 'GET') {
      const [configs, people, recent] = await Promise.all([
        listActivityConfigs(),
        sql`
          SELECT id, nome, turno, perfil
          FROM usuarios
          WHERE status = 'ativo'
            AND id <> ${usuario.id}
          ORDER BY nome
        `,
        sql`
          SELECT DISTINCT l.id
          FROM atividade_lancamentos l
          INNER JOIN atividade_lancamento_participantes p ON p.lancamento_id = l.id
          WHERE l.atividade_chave LIKE 'separacao_%'
            AND p.usuario_id = ${usuario.id}
          ORDER BY l.id DESC
          LIMIT 10
        `,
      ])

      const configMap = new Map(configs.map((item) => [item.chave, item]))
      const tipos = []
      for (const item of SEPARATION_TYPES) {
        const personalConfig = await getActivityConfig(item.chave, usuario.id)
        const baseConfig = configMap.get(item.chave)
        const resolvedConfig = personalConfig || baseConfig
        if (resolvedConfig?.ativo) {
          tipos.push({
            ...item,
            valor_unitario: Number(resolvedConfig.valor_unitario || 0),
            ativo: true,
          })
        }
      }

      const lancamentos = []
      for (const row of recent) {
        const batch = await loadActivityBatch(Number(row.id))
        if (batch) lancamentos.push(batch)
      }

      return res.status(200).json({
        status: 'ok',
        tipos,
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
      const selectedType = SEPARATION_TYPES.find((item) => item.chave === payload.tipo_atividade)

      if (!selectedType) {
        return res.status(400).json({ status: 'error', message: 'Selecione um tipo de separação válido.' })
      }

      const config = await getActivityConfig(selectedType.chave, usuario.id)
      if (!config?.ativo) {
        return res.status(404).json({ status: 'error', message: 'Atividade indisponível.' })
      }

      if (selectedType.tipo_calculo === 'por_plt') {
        if (payload.quantidade_plt <= 0 || payload.quantidade_plt > 99999) {
          return res.status(400).json({ status: 'error', message: 'Informe uma quantidade válida de PLTs.' })
        }
      }

      if (selectedType.exige_mapa && !payload.numero_mapa) {
        return res.status(400).json({ status: 'error', message: 'Informe o número do mapa.' })
      }

      if (selectedType.exige_placa && !payload.placa_veiculo) {
        return res.status(400).json({ status: 'error', message: 'Informe a placa do veículo.' })
      }

      if (!validImageData(payload.evidencia_foto)) {
        return res.status(400).json({ status: 'error', message: 'Tire ou envie uma foto válida como evidência.' })
      }

      if (selectedType.chave === 'separacao_marketing') {
        const existing = await sql`
          SELECT id, usuario_criador_nome
          FROM atividade_lancamentos
          WHERE atividade_chave = 'separacao_marketing'
            AND status <> 'reprovado'
            AND UPPER(COALESCE(detalhes->>'numero_mapa', '')) = ${payload.numero_mapa}
          LIMIT 1
        `

        if (existing[0]) {
          return res.status(409).json({
            status: 'error',
            message: `Mapa duplicado. Esse mapa já foi lançado por ${existing[0].usuario_criador_nome}.`,
          })
        }
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

      let ajudante = null
      if (payload.ajudante_usuario_id) {
        const helperRows = await sql`
          SELECT id, nome, cpf, turno
          FROM usuarios
          WHERE id = ${payload.ajudante_usuario_id}
            AND id <> ${usuario.id}
            AND status = 'ativo'
          LIMIT 1
        `
        ajudante = helperRows[0]

        if (!ajudante) {
          return res.status(400).json({ status: 'error', message: 'O segundo ajudante não foi encontrado ou está inativo.' })
        }
      }

      const quantidadeCalculo = selectedType.tipo_calculo === 'por_plt' ? payload.quantidade_plt : 1
      const participantes = [
        { ...principal, papel: 'principal' },
        ...(ajudante ? [{ ...ajudante, papel: 'ajudante' }] : []),
      ]

      for (const participant of participantes) {
        const participantConfig = await getActivityConfig(selectedType.chave, participant.id)
        participant.valor_unitario = Number(participantConfig?.valor_unitario ?? config.valor_unitario)
      }

      const detalhes = {
        tipo_atividade: selectedType.chave,
        tipo_atividade_nome: selectedType.nome,
        tipo_calculo: selectedType.tipo_calculo,
        quantidade_calculo: quantidadeCalculo,
        quantidade_plt: selectedType.tipo_calculo === 'por_plt' ? payload.quantidade_plt : null,
        numero_mapa: selectedType.exige_mapa ? payload.numero_mapa : null,
        placa_veiculo: selectedType.exige_placa ? payload.placa_veiculo : null,
        segundo_ajudante: Boolean(ajudante),
        ajudante_nome: ajudante?.nome || null,
      }

      const observacaoPartes = [
        `Tipo: ${selectedType.nome}`,
        `Segundo ajudante: ${ajudante ? 'Sim' : 'Não'}`,
      ]
      if (selectedType.tipo_calculo === 'por_plt') observacaoPartes.push(`PLTs: ${payload.quantidade_plt}`)
      if (selectedType.exige_mapa) observacaoPartes.push(`Mapa: ${payload.numero_mapa}`)
      if (selectedType.exige_placa) observacaoPartes.push(`Placa: ${payload.placa_veiculo}`)
      if (ajudante) observacaoPartes.push(`Ajudante: ${ajudante.nome}`)

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
            ${selectedType.nome},
            ${currentBahiaDate()},
            ${principal.id},
            ${principal.nome},
            ${config.valor_unitario},
            ${observacaoPartes.join(' | ')},
            ${JSON.stringify(detalhes)}::jsonb,
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
            ${config.valor_unitario},
            ${payload.evidencia_foto}
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
        message: ajudante
          ? 'Separação enviada para aprovação para os dois participantes.'
          : 'Separação enviada para aprovação.',
        lancamento: await loadActivityBatch(lancamentoId),
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('activities_separacao_error', error)
    return res.status(500).json({ status: 'error', message: 'Não foi possível processar o lançamento de Separação.' })
  }
}

function normalizePayload(body = {}) {
  return {
    tipo_atividade: String(body.tipo_atividade || '').trim().toLowerCase(),
    ajudante_usuario_id: Number(body.ajudante_usuario_id || 0) || 0,
    numero_mapa: String(body.numero_mapa || '').trim().toUpperCase().replace(/\s+/g, ' '),
    placa_veiculo: String(body.placa_veiculo || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
    quantidade_plt: Math.max(0, Math.trunc(Number(body.quantidade_plt || 0))),
    evidencia_foto: String(body.evidencia_foto || '').trim(),
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
    console.error('activities_separacao_auth_error', error)
    res.status(500).json({ status: 'error', message: 'Não foi possível validar seu acesso.' })
    return null
  }
}
