import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'
import {
  applyWalletCap,
  ensureWalletSchema,
  monthRange,
  resolveMonth,
  roundMoney,
} from '../_lib/wallet.js'
import { ensureWmsTaskSchema } from '../_lib/wms-tasks.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  }

  const sessionUser = await getSessionUser(req)
  if (!sessionUser) {
    return res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
  }

  try {
    await Promise.all([
      ensureWalletSchema(),
      ensureWmsTaskSchema(),
    ])

    const month = resolveMonth(req.query?.mes)
    const { start, endExclusive } = monthRange(month)

    const userRows = await sql`
      SELECT id, nome, turno, perfil, wms_usuario_id
      FROM usuarios
      WHERE id = ${sessionUser.id}
      LIMIT 1
    `
    const user = userRows[0]
    if (!user) return res.status(404).json({ status: 'error', message: 'Usuário não encontrado.' })

    const [capRows, wmsRows, taskRows, escalonadaRows, activityRows] = await Promise.all([
      sql`
        SELECT valor_teto FROM remuneracao_tetos
        WHERE usuario_id = ${user.id}
        LIMIT 1
      `,
      sql`
        SELECT data_ref,
               COALESCE(SUM(valor), 0)::numeric AS valor
        FROM wms_rateio_registros
        WHERE data_ref >= ${start}::date
          AND data_ref < ${endExclusive}::date
          AND (
            (
              NULLIF(${String(user.wms_usuario_id || '')}, '') IS NOT NULL
              AND wms_usuario_id::text = ${String(user.wms_usuario_id || '')}
            )
            OR UPPER(TRIM(COALESCE(usuario_nome, ''))) = UPPER(TRIM(${user.nome}))
          )
        GROUP BY data_ref
        ORDER BY data_ref
      `,
      sql`
        SELECT
          data_ref,
          tipo_chave,
          tipo_nome,
          valor_unitario,
          COUNT(*)::int AS quantidade,
          COALESCE(SUM(valor_unitario), 0)::numeric AS valor
        FROM wms_tarefas_registros
        WHERE usuario_id = ${user.id}
          AND data_ref >= ${start}::date
          AND data_ref < ${endExclusive}::date
        GROUP BY data_ref, tipo_chave, tipo_nome, valor_unitario
        ORDER BY data_ref, tipo_nome
      `,
      sql`
        SELECT data_ref,
               COALESCE(incentivo, 0)::numeric AS valor,
               percentual
        FROM escalonada_resultados
        WHERE usuario_id = ${user.id}
          AND data_ref >= ${start}::date
          AND data_ref < ${endExclusive}::date
          AND incentivo > 0
        ORDER BY data_ref
      `,
      sql`
        SELECT
          l.id,
          l.data_atividade,
          l.atividade_nome,
          l.atividade_chave,
          COALESCE(p.valor_unitario, l.valor_unitario, 0)::numeric AS valor_unitario,
          COALESCE(
            NULLIF(l.detalhes->>'quantidade_calculo', '')::numeric,
            (SELECT COUNT(*)::numeric FROM atividade_lancamento_itens i WHERE i.lancamento_id = l.id),
            1
          )::numeric AS quantidade_calculo
        FROM atividade_lancamentos l
        INNER JOIN atividade_lancamento_participantes p
          ON p.lancamento_id = l.id
        WHERE p.usuario_id = ${user.id}
          AND l.status = 'aprovado'
          AND l.data_atividade >= ${start}::date
          AND l.data_atividade < ${endExclusive}::date
        ORDER BY l.data_atividade, l.id
      `,
    ])

    const entries = []

    for (const row of wmsRows) {
      entries.push({
        id: `wms-${row.data_ref}`,
        data: row.data_ref,
        tipo: 'wms',
        titulo: 'Valor WMS',
        detalhe: 'Rateio WMS',
        valor_original: Number(row.valor || 0),
      })
    }

    for (const row of taskRows) {
      const quantity = Number(row.quantidade || 0)
      const unitValue = Number(row.valor_unitario || 0)

      entries.push({
        id: `wms-tarefa-${row.data_ref}-${row.tipo_chave}-${unitValue}`,
        data: row.data_ref,
        tipo: 'wms_tarefa',
        titulo: row.tipo_nome,
        detalhe: `${quantity} ${quantity === 1 ? 'tarefa concluída' : 'tarefas concluídas'} • ${moneyBr(unitValue)} cada`,
        tarefa_chave: row.tipo_chave,
        quantidade: quantity,
        valor_unitario: unitValue,
        valor_original: Number(row.valor || 0),
      })
    }

    for (const row of escalonadaRows) {
      entries.push({
        id: `esc-${row.data_ref}`,
        data: row.data_ref,
        tipo: 'escalonada',
        titulo: 'Escalonada',
        detalhe: `Incentivo de ${Number(row.percentual || 0)}%`,
        valor_original: Number(row.valor || 0),
      })
    }

    for (const row of activityRows) {
      const unitValue = Number(row.valor_unitario || 0)
      const quantity = Number(row.quantidade_calculo || 1)
      entries.push({
        id: `atividade-${row.id}`,
        data: row.data_atividade,
        tipo: 'atividade',
        titulo: row.atividade_nome,
        detalhe: quantity === 0.5
          ? 'Atividade aprovada • 50% do valor'
          : 'Atividade aprovada',
        atividade_chave: row.atividade_chave,
        valor_original: roundMoney(unitValue * quantity),
      })
    }

    entries.sort((a, b) => {
      const dateCompare = String(a.data).localeCompare(String(b.data))
      if (dateCompare !== 0) return dateCompare
      const priority = { wms: 1, wms_tarefa: 2, escalonada: 3, atividade: 4 }
      return (priority[a.tipo] || 9) - (priority[b.tipo] || 9)
    })

    const cap = capRows[0]?.valor_teto == null ? null : Number(capRows[0].valor_teto)
    const extract = applyWalletCap(entries, cap)
    const totalWms = roundMoney(entries.filter((e) => e.tipo === 'wms').reduce((s, e) => s + Number(e.valor_original || 0), 0))
    const totalWmsTasks = roundMoney(entries.filter((e) => e.tipo === 'wms_tarefa').reduce((s, e) => s + Number(e.valor_original || 0), 0))
    const totalEscalonada = roundMoney(entries.filter((e) => e.tipo === 'escalonada').reduce((s, e) => s + Number(e.valor_original || 0), 0))
    const totalActivities = roundMoney(entries.filter((e) => e.tipo === 'atividade').reduce((s, e) => s + Number(e.valor_original || 0), 0))
    const bruto = roundMoney(totalWms + totalWmsTasks + totalEscalonada + totalActivities)
    const saldo = roundMoney(extract.reduce((s, e) => s + Number(e.valor_creditado || 0), 0))

    return res.status(200).json({
      status: 'ok',
      mes: month,
      usuario: {
        id: Number(user.id),
        nome: user.nome,
        turno: user.turno || '',
      },
      teto: {
        possui: cap != null,
        valor: cap,
        atingido: cap != null && saldo >= cap,
        restante: cap == null ? null : roundMoney(Math.max(0, cap - saldo)),
      },
      totais: {
        valor_wms: totalWms,
        tarefas_wms: totalWmsTasks,
        escalonada: totalEscalonada,
        atividades: totalActivities,
        bruto,
        saldo,
        bloqueado_teto: roundMoney(Math.max(0, bruto - saldo)),
      },
      extrato: extract.slice().reverse(),
    })
  } catch (error) {
    console.error('wallet_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível carregar sua carteira.',
    })
  }
}

function moneyBr(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}
