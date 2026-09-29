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

export default async function handler(req, res) {
  const usuario = await requireActivitiesUser(req, res)
  if (!usuario) return

  try {
    await ensureActivitiesSchema()
    const config = await getActivityConfig('amarracao')

    if (!config?.ativo) {
      return res.status(404).json({ status: 'error', message: 'Atividade Amarração indisponível.' })
    }

    if (req.method === 'GET') {
      const [people, recent] = await Promise.all([
        sql\`
          SELECT id, nome, turno, perfil
          FROM usuarios
          WHERE status = 'ativo'
            AND id <> \${usuario.id}
          ORDER BY nome
        \`,
        sql\`
          SELECT DISTINCT l.id
          FROM atividade_lancamentos l
          INNER JOIN atividade_lancamento_participantes p ON p.lancamento_id = l.id
          WHERE l.atividade_chave = 'amarracao'
            AND p.usuario_id = \${usuario.id}
          ORDER BY l.id DESC
          LIMIT 8
        \`,
      ])

      const lancamentos = []
      for (const row of recent) {
        const batch = await loadActivityBatch(Number(row.id))
        if (batch) lancamentos.push(batch)
      }

      return res.status(200).json({
        status: 'ok',
        atividade: config,
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

      if (!validImageData(payload.evidencia_foto)) {
        return res.status(400).json({
          status: 'error',
          message: 'Envie uma foto válida como evidência.',
        })
      }

      const existing = await sql\`
        SELECT l.id, l.usuario_criador_nome
        FROM atividade_lancamentos l
        INNER JOIN atividade_lancamento_itens i ON i.lancamento_id = l.id
        WHERE l.atividade_chave = 'amarracao'
          AND l.status <> 'reprovado'
          AND i.opcao_chave = \${payload.mapa_op}
        LIMIT 1
      \`

      if (existing[0]) {
        return res.status(409).json({
          status: 'error',
          message: \`Esse Mapa/OP já foi lançado por \${existing[0].usuario_criador_nome}.\`,
        })
      }

      const principalRows = await sql\`
        SELECT id, nome, cpf, turno
        FROM usuarios
        WHERE id = \${usuario.id}
          AND status = 'ativo'
        LIMIT 1
      \`
      const principal = principalRows[0]

      if (!principal) {
        return res.status(401).json({ status: 'error', message: 'Usuário não encontrado.' })
      }

      let ajudante = null

      if (payload.ajudante_usuario_id) {
        const helperRows = await sql\`
          SELECT id, nome, cpf, turno
          FROM usuarios
          WHERE id = \${payload.ajudante_usuario_id}
            AND id <> \${usuario.id}
            AND status = 'ativo'
          LIMIT 1
        \`
        ajudante = helperRows[0]

        if (!ajudante) {
          return res.status(400).json({
            status: 'error',
            message: 'O segundo ajudante selecionado não foi encontrado ou está inativo.',
          })
        }
      }

      const participantes = [
        { ...principal, papel: 'principal' },
        ...(ajudante ? [{ ...ajudante, papel: 'ajudante' }] : []),
      ]

      let lancamentoId = null

      try {
        const inserted = await sql\`
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
            'amarracao',
            'Amarração',
            \${currentBahiaDate()},
            \${principal.id},
            \${principal.nome},
            \${config.valor_unitario},
            \${payload.observacao || null},
            \${JSON.stringify({
              mapa_op: payload.mapa_op,
              placa_cavalo: payload.placa_cavalo,
              segundo_ajudante: Boolean(ajudante),
            })}::jsonb,
            'pendente'
          )
          RETURNING id
        \`

        lancamentoId = Number(inserted[0].id)

        for (const participant of participantes) {
          await sql\`
            INSERT INTO atividade_lancamento_participantes (
              lancamento_id,
              usuario_id,
              usuario_nome,
              usuario_cpf,
              usuario_turno,
              papel
            )
            VALUES (
              \${lancamentoId},
              \${participant.id},
              \${participant.nome},
              \${participant.cpf || null},
              \${participant.turno || null},
              \${participant.papel}
            )
          \`
        }

        await sql\`
          INSERT INTO atividade_lancamento_itens (
            lancamento_id,
            opcao_chave,
            opcao_nome,
            valor_unitario,
            evidencia_foto
          )
          VALUES (
            \${lancamentoId},
            \${payload.mapa_op},
            \${\`Mapa/OP \${payload.mapa_op}\`},
            \${config.valor_unitario},
            \${payload.evidencia_foto}
          )
        \`
      } catch (error) {
        if (lancamentoId) {
          await sql\`DELETE FROM atividade_lancamentos WHERE id = \${lancamentoId}\`
        }
        throw error
      }

      return res.status(201).json({
        status: 'ok',
        message: ajudante
          ? 'Amarração enviada para aprovação para os dois participantes.'
          : 'Amarração enviada para aprovação.',
        lancamento: await loadActivityBatch(lancamentoId),
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('activities_amarracao_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar o lançamento de Amarração.',
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
    console.error('activities_amarracao_auth_error', error)
    res.status(500).json({ status: 'error', message: 'Não foi possível validar seu acesso.' })
    return null
  }
}

function normalizePayload(body = {}) {
  return {
    mapa_op: normalizeMap(body.mapa_op),
    placa_cavalo: normalizePlate(body.placa_cavalo),
    ajudante_usuario_id: Number(body.ajudante_usuario_id || 0) || 0,
    evidencia_foto: String(body.evidencia_foto || '').trim(),
    observacao: String(body.observacao || '').trim().slice(0, 3000),
  }
}

function validatePayload(payload) {
  if (!payload.mapa_op) return 'Informe o Mapa ou OP.'
  if (!payload.placa_cavalo) return 'Informe a placa do cavalo.'
  return ''
}

function normalizeMap(value) {
  return String(value || '').trim().toUpperCase().replace(/\\s+/g, ' ')
}

function normalizePlate(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}
