import { sql } from './db.js'
import {
  applyWalletCap,
  ensureWalletSchema,
  monthRange,
  resolveMonth,
  roundMoney,
} from './wallet.js'
import { ensureWmsTaskSchema } from './wms-tasks.js'

export async function ensureRemunerationAdminSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS admin_auditoria (
      id BIGSERIAL PRIMARY KEY,
      usuario_id BIGINT,
      usuario_nome VARCHAR(180),
      acao VARCHAR(120) NOT NULL,
      entidade VARCHAR(120) NOT NULL,
      entidade_id VARCHAR(180),
      descricao TEXT,
      antes JSONB,
      depois JSONB,
      metadata JSONB,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_admin_auditoria_criado
    ON admin_auditoria(criado_em DESC)
  `

  await sql`
    CREATE TABLE IF NOT EXISTS remuneracao_fechamentos (
      mes CHAR(7) PRIMARY KEY,
      status VARCHAR(20) NOT NULL DEFAULT 'aberto',
      snapshot JSONB,
      conferido_por_id BIGINT,
      conferido_por_nome VARCHAR(180),
      conferido_em TIMESTAMPTZ,
      fechado_por_id BIGINT,
      fechado_por_nome VARCHAR(180),
      fechado_em TIMESTAMPTZ,
      reaberto_por_id BIGINT,
      reaberto_por_nome VARCHAR(180),
      reaberto_em TIMESTAMPTZ,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

export async function logAdminAction(admin, {
  action,
  entity,
  entityId = null,
  description = '',
  before = null,
  after = null,
  metadata = null,
}) {
  try {
    await ensureRemunerationAdminSchema()
    await sql`
      INSERT INTO admin_auditoria (
        usuario_id, usuario_nome, acao, entidade, entidade_id,
        descricao, antes, depois, metadata, criado_em
      )
      VALUES (
        ${admin?.id || null},
        ${admin?.nome || null},
        ${String(action || '').slice(0, 120)},
        ${String(entity || '').slice(0, 120)},
        ${entityId == null ? null : String(entityId).slice(0, 180)},
        ${description || null},
        ${before == null ? null : JSON.stringify(before)}::jsonb,
        ${after == null ? null : JSON.stringify(after)}::jsonb,
        ${metadata == null ? null : JSON.stringify(metadata)}::jsonb,
        NOW()
      )
    `
  } catch (error) {
    console.warn('admin_audit_warning', error?.message || error)
  }
}

export async function isMonthClosed(value) {
  await ensureRemunerationAdminSchema()
  const month = String(value || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) return false

  const rows = await sql`
    SELECT status
    FROM remuneracao_fechamentos
    WHERE mes = ${month}
    LIMIT 1
  `

  return rows[0]?.status === 'fechado'
}

export async function getMonthClosure(month) {
  await ensureRemunerationAdminSchema()
  const normalized = resolveMonth(month)

  const rows = await sql`
    SELECT *
    FROM remuneracao_fechamentos
    WHERE mes = ${normalized}
    LIMIT 1
  `

  return rows[0] || {
    mes: normalized,
    status: 'aberto',
    snapshot: null,
  }
}

export async function listMonthClosures(limit = 14) {
  await ensureRemunerationAdminSchema()

  const rows = await sql`
    SELECT
      mes, status,
      conferido_por_nome, conferido_em,
      fechado_por_nome, fechado_em,
      reaberto_por_nome, reaberto_em,
      atualizado_em
    FROM remuneracao_fechamentos
    ORDER BY mes DESC
    LIMIT ${Math.max(1, Math.min(36, Number(limit) || 14))}
  `

  return rows
}

export async function markMonthReviewed(month, admin) {
  await ensureRemunerationAdminSchema()
  const normalized = resolveMonth(month)

  const current = await getMonthClosure(normalized)
  if (current.status === 'fechado') {
    const error = new Error('MONTH_CLOSED')
    error.code = 'MONTH_CLOSED'
    throw error
  }

  await sql`
    INSERT INTO remuneracao_fechamentos (
      mes, status, conferido_por_id, conferido_por_nome, conferido_em, atualizado_em
    )
    VALUES (
      ${normalized}, 'conferido', ${admin.id}, ${admin.nome}, NOW(), NOW()
    )
    ON CONFLICT (mes)
    DO UPDATE SET
      status = 'conferido',
      conferido_por_id = EXCLUDED.conferido_por_id,
      conferido_por_nome = EXCLUDED.conferido_por_nome,
      conferido_em = NOW(),
      atualizado_em = NOW()
  `

  await logAdminAction(admin, {
    action: 'conferir_mes',
    entity: 'remuneracao_fechamento',
    entityId: normalized,
    description: `Mês ${normalized} marcado como conferido.`,
  })

  return getMonthClosure(normalized)
}

export async function closeMonth(month, admin) {
  await ensureRemunerationAdminSchema()
  const normalized = resolveMonth(month)

  const users = await sql`
    SELECT id
    FROM usuarios
    WHERE status = 'ativo'
    ORDER BY id
  `

  const snapshots = {}
  const batchSize = 8

  for (let start = 0; start < users.length; start += batchSize) {
    const batch = users.slice(start, start + batchSize)
    const items = await Promise.all(
      batch.map((user) => buildLiveWalletData(Number(user.id), normalized)),
    )
    for (const item of items) {
      snapshots[String(item.usuario.id)] = item
    }
  }

  await sql`
    INSERT INTO remuneracao_fechamentos (
      mes, status, snapshot,
      fechado_por_id, fechado_por_nome, fechado_em,
      atualizado_em
    )
    VALUES (
      ${normalized}, 'fechado', ${JSON.stringify(snapshots)}::jsonb,
      ${admin.id}, ${admin.nome}, NOW(), NOW()
    )
    ON CONFLICT (mes)
    DO UPDATE SET
      status = 'fechado',
      snapshot = EXCLUDED.snapshot,
      fechado_por_id = EXCLUDED.fechado_por_id,
      fechado_por_nome = EXCLUDED.fechado_por_nome,
      fechado_em = NOW(),
      reaberto_por_id = NULL,
      reaberto_por_nome = NULL,
      reaberto_em = NULL,
      atualizado_em = NOW()
  `

  await logAdminAction(admin, {
    action: 'fechar_mes',
    entity: 'remuneracao_fechamento',
    entityId: normalized,
    description: `Mês ${normalized} fechado com snapshot de ${users.length} usuário(s).`,
    metadata: { usuarios: users.length },
  })

  return getMonthClosure(normalized)
}

export async function reopenMonth(month, admin) {
  await ensureRemunerationAdminSchema()
  const normalized = resolveMonth(month)

  await sql`
    INSERT INTO remuneracao_fechamentos (
      mes, status, reaberto_por_id, reaberto_por_nome, reaberto_em, atualizado_em
    )
    VALUES (
      ${normalized}, 'aberto', ${admin.id}, ${admin.nome}, NOW(), NOW()
    )
    ON CONFLICT (mes)
    DO UPDATE SET
      status = 'aberto',
      snapshot = NULL,
      reaberto_por_id = EXCLUDED.reaberto_por_id,
      reaberto_por_nome = EXCLUDED.reaberto_por_nome,
      reaberto_em = NOW(),
      atualizado_em = NOW()
  `

  await logAdminAction(admin, {
    action: 'reabrir_mes',
    entity: 'remuneracao_fechamento',
    entityId: normalized,
    description: `Mês ${normalized} reaberto para ajustes.`,
  })

  return getMonthClosure(normalized)
}

export async function getWalletData(userId, month) {
  const normalized = resolveMonth(month)
  const closure = await getMonthClosure(normalized)

  if (closure.status === 'fechado' && closure.snapshot) {
    const snap = closure.snapshot?.[String(userId)]
    if (snap) {
      return {
        ...snap,
        fechamento: {
          status: 'fechado',
          fechado_em: closure.fechado_em,
          fechado_por_nome: closure.fechado_por_nome,
        },
      }
    }
  }

  const live = await buildLiveWalletData(userId, normalized)
  return {
    ...live,
    fechamento: {
      status: closure.status || 'aberto',
      fechado_em: closure.fechado_em || null,
      fechado_por_nome: closure.fechado_por_nome || null,
    },
  }
}

export async function buildLiveWalletData(userId, month) {
  await Promise.all([
    ensureWalletSchema(),
    ensureWmsTaskSchema(),
  ])

  const normalized = resolveMonth(month)
  const { start, endExclusive } = monthRange(normalized)

  const userRows = await sql`
    SELECT id, nome, turno, perfil, cargo, wms_usuario_id
    FROM usuarios
    WHERE id = ${userId}
    LIMIT 1
  `
  const user = userRows[0]
  if (!user) {
    const error = new Error('USER_NOT_FOUND')
    error.code = 'USER_NOT_FOUND'
    throw error
  }

  const [capRows, wmsRows, taskRows, escalonadaRows, activityRows] = await Promise.all([
    sql`
      SELECT valor_teto
      FROM remuneracao_tetos
      WHERE usuario_id = ${user.id}
      LIMIT 1
    `,
    sql`
      SELECT data_ref, COALESCE(SUM(valor), 0)::numeric AS valor
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
        data_ref, tipo_chave, tipo_nome, valor_unitario,
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
      SELECT data_ref, COALESCE(incentivo, 0)::numeric AS valor, percentual
      FROM escalonada_resultados
      WHERE usuario_id = ${user.id}
        AND data_ref >= ${start}::date
        AND data_ref < ${endExclusive}::date
        AND incentivo > 0
      ORDER BY data_ref
    `,
    sql`
      SELECT
        l.id, l.data_atividade, l.atividade_nome, l.atividade_chave,
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
      id: `wms-${isoDate(row.data_ref)}`,
      data: isoDate(row.data_ref),
      tipo: 'wms',
      titulo: 'Valor WMS',
      detalhe: 'Rateio WMS',
      valor_original: Number(row.valor || 0),
    })
  }

  for (const row of taskRows) {
    const quantity = Number(row.quantidade || 0)
    const unitValue = Number(row.valor_unitario || 0)
    const date = isoDate(row.data_ref)

    entries.push({
      id: `wms-tarefa-${date}-${row.tipo_chave}-${unitValue}`,
      data: date,
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
    const date = isoDate(row.data_ref)
    entries.push({
      id: `esc-${date}`,
      data: date,
      tipo: 'escalonada',
      titulo: 'Escalonada',
      detalhe: `Incentivo de ${Number(row.percentual || 0)}%`,
      valor_original: Number(row.valor || 0),
    })
  }

  for (const row of activityRows) {
    const unitValue = Number(row.valor_unitario || 0)
    const quantity = Number(row.quantidade_calculo || 1)
    const date = isoDate(row.data_atividade)
    entries.push({
      id: `atividade-${row.id}`,
      data: date,
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

  return {
    status: 'ok',
    mes: normalized,
    usuario: {
      id: Number(user.id),
      nome: user.nome,
      turno: user.turno || '',
      cargo: user.cargo || '',
      perfil: user.perfil || '',
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
  }
}

export async function buildAdminDashboard(month) {
  const normalized = resolveMonth(month)
  const closure = await getMonthClosure(normalized)
  const users = await sql`
    SELECT id, nome, turno, cargo, perfil
    FROM usuarios
    WHERE status = 'ativo'
    ORDER BY nome
  `

  const wallets = []
  const batchSize = 8
  for (let start = 0; start < users.length; start += batchSize) {
    const batch = users.slice(start, start + batchSize)
    const data = await Promise.all(
      batch.map((user) => getWalletData(Number(user.id), normalized)),
    )
    wallets.push(...data)
  }

  const byTurn = new Map()
  const byCargo = new Map()
  const daily = new Map()

  const resumo = {
    usuarios: wallets.length,
    bruto: 0,
    saldo: 0,
    valor_wms: 0,
    tarefas_wms: 0,
    escalonada: 0,
    atividades: 0,
    bloqueado_teto: 0,
    atingiram_teto: 0,
  }

  for (const wallet of wallets) {
    for (const key of ['bruto', 'saldo', 'valor_wms', 'tarefas_wms', 'escalonada', 'atividades', 'bloqueado_teto']) {
      resumo[key] = roundMoney(resumo[key] + Number(wallet.totais?.[key] || 0))
    }
    if (wallet.teto?.atingido) resumo.atingiram_teto += 1

    const turn = wallet.usuario.turno || 'Sem turno'
    const cargo = wallet.usuario.cargo || wallet.usuario.perfil || 'Sem cargo'
    byTurn.set(turn, roundMoney((byTurn.get(turn) || 0) + Number(wallet.totais?.saldo || 0)))
    byCargo.set(cargo, roundMoney((byCargo.get(cargo) || 0) + Number(wallet.totais?.saldo || 0)))

    for (const entry of wallet.extrato || []) {
      const date = String(entry.data || '').slice(0, 10)
      daily.set(date, roundMoney((daily.get(date) || 0) + Number(entry.valor_creditado || 0)))
    }
  }

  const usuarios = wallets
    .map((wallet) => ({
      id: wallet.usuario.id,
      nome: wallet.usuario.nome,
      turno: wallet.usuario.turno,
      cargo: wallet.usuario.cargo,
      bruto: wallet.totais.bruto,
      saldo: wallet.totais.saldo,
      teto: wallet.teto.valor,
      atingiu_teto: wallet.teto.atingido,
      valor_wms: wallet.totais.valor_wms,
      tarefas_wms: wallet.totais.tarefas_wms,
      escalonada: wallet.totais.escalonada,
      atividades: wallet.totais.atividades,
    }))
    .sort((a, b) => b.saldo - a.saldo)

  return {
    mes: normalized,
    fechamento: {
      status: closure.status || 'aberto',
      conferido_em: closure.conferido_em || null,
      conferido_por_nome: closure.conferido_por_nome || null,
      fechado_em: closure.fechado_em || null,
      fechado_por_nome: closure.fechado_por_nome || null,
    },
    resumo,
    usuarios,
    por_turno: [...byTurn.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor),
    por_cargo: [...byCargo.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor),
    por_dia: [...daily.entries()].map(([data, valor]) => ({ data, valor })).sort((a, b) => a.data.localeCompare(b.data)),
  }
}

export async function getIntegrationAlerts(date) {
  await Promise.all([
    ensureRemunerationAdminSchema(),
    ensureWmsTaskSchema(),
  ])

  const targetDate = String(date || '').slice(0, 10)
  const [rateio, item, tasks, missingUsers, zeroTypes, rateioUnlinked] = await Promise.all([
    sql`SELECT status, total_registros, coletado_em, erro FROM wms_rateio_coletas WHERE data_ref = ${targetDate}::date LIMIT 1`,
    sql`SELECT status, total_registros, coletado_em, erro FROM wms_item_coletas WHERE data_ref = ${targetDate}::date LIMIT 1`,
    sql`SELECT status, total_recebido, total_completo, total_vinculado, total_sem_usuario, total_sem_valor, atualizado_em, mensagem FROM wms_tarefa_coletas WHERE data_ref = ${targetDate}::date LIMIT 1`,
    sql`
      SELECT COUNT(*)::int AS total
      FROM wms_tarefas_registros
      WHERE data_ref = ${targetDate}::date
        AND usuario_id IS NULL
    `,
    sql`
      SELECT nome, valor_unitario
      FROM wms_tarefa_valores
      WHERE ativo = TRUE
        AND valor_unitario <= 0
      ORDER BY nome
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM wms_rateio_registros r
      WHERE r.data_ref = ${targetDate}::date
        AND NOT EXISTS (
          SELECT 1
          FROM usuarios u
          WHERE u.status = 'ativo'
            AND (
              (NULLIF(TRIM(COALESCE(u.wms_usuario_id, '')), '') IS NOT NULL
               AND u.wms_usuario_id::text = r.wms_usuario_id::text)
              OR UPPER(TRIM(COALESCE(u.nome, ''))) = UPPER(TRIM(COALESCE(r.usuario_nome, '')))
            )
        )
    `,
  ])

  const alerts = []
  addCollectionAlert(alerts, 'Rateio WMS', rateio[0], targetDate)
  addCollectionAlert(alerts, 'WMS Item', item[0], targetDate)
  addTaskCollectionAlert(alerts, tasks[0], targetDate)

  const taskMissing = Number(missingUsers[0]?.total || 0)
  if (taskMissing > 0) {
    alerts.push({
      id: 'tarefas-sem-usuario',
      severity: 'warning',
      title: 'Tarefas completas sem vínculo',
      message: `${taskMissing} tarefa(s) de ${targetDate} não estão vinculadas a um usuário elegível do Warehouse.`,
    })
  }

  const rateioMissing = Number(rateioUnlinked[0]?.total || 0)
  if (rateioMissing > 0) {
    alerts.push({
      id: 'rateio-sem-usuario',
      severity: 'warning',
      title: 'Rateio com usuários não vinculados',
      message: `${rateioMissing} registro(s) do Rateio de ${targetDate} não encontraram usuário no Warehouse.`,
    })
  }

  if (zeroTypes.length > 0) {
    alerts.push({
      id: 'tipos-sem-valor',
      severity: 'warning',
      title: 'Tipos WMS sem valor',
      message: `${zeroTypes.length} tipo(s) de tarefa estão ativos com valor R$ 0,00.`,
      detalhes: zeroTypes.slice(0, 20).map((row) => row.nome),
    })
  }

  if (!alerts.length) {
    alerts.push({
      id: 'integracao-ok',
      severity: 'success',
      title: 'Integrações sem pendências',
      message: `Nenhuma pendência automática encontrada para ${targetDate}.`,
    })
  }

  return alerts
}

export async function listAuditLogs(limit = 100) {
  await ensureRemunerationAdminSchema()

  return sql`
    SELECT
      id, usuario_id, usuario_nome, acao, entidade, entidade_id,
      descricao, antes, depois, metadata, criado_em
    FROM admin_auditoria
    ORDER BY criado_em DESC
    LIMIT ${Math.max(1, Math.min(300, Number(limit) || 100))}
  `
}

function addCollectionAlert(alerts, label, row, date) {
  if (!row) {
    alerts.push({
      id: `${label}-ausente`,
      severity: 'error',
      title: `${label} sem coleta`,
      message: `Não existe coleta registrada para ${date}.`,
    })
    return
  }

  if (row.status !== 'ok') {
    alerts.push({
      id: `${label}-erro`,
      severity: 'error',
      title: `${label} com erro`,
      message: row.erro || `A coleta de ${date} não terminou com sucesso.`,
    })
    return
  }

  if (Number(row.total_registros || 0) === 0) {
    alerts.push({
      id: `${label}-zero`,
      severity: 'warning',
      title: `${label} retornou zero registros`,
      message: `A coleta de ${date} terminou como OK, mas não trouxe registros. Vale conferir o WMS.`,
    })
  }
}

function addTaskCollectionAlert(alerts, row, date) {
  if (!row) {
    alerts.push({
      id: 'tarefas-ausente',
      severity: 'error',
      title: 'Monitorar Tarefas sem coleta',
      message: `Não existe coleta registrada para ${date}.`,
    })
    return
  }

  if (row.status !== 'ok') {
    alerts.push({
      id: 'tarefas-erro',
      severity: 'error',
      title: 'Monitorar Tarefas com erro',
      message: row.mensagem || `A coleta de ${date} não terminou com sucesso.`,
    })
    return
  }

  if (Number(row.total_completo || 0) === 0) {
    alerts.push({
      id: 'tarefas-zero',
      severity: 'warning',
      title: 'Monitorar Tarefas retornou zero completas',
      message: `A coleta de ${date} terminou como OK, mas nenhuma tarefa completa foi encontrada.`,
    })
  }
}

function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value || '')
  const match = text.match(/^\d{4}-\d{2}-\d{2}/)
  if (match) return match[0]
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? text.slice(0, 10) : parsed.toISOString().slice(0, 10)
}

function moneyBr(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}
