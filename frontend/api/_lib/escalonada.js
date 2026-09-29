import { sql } from './db.js'

const DEFAULT_PICKPACK_AREA = 'Marketplace'

export async function calculateEscalonadaForDate(date) {
  const pickPackArea = String(
    process.env.WMS_PICKPACK_AREA || DEFAULT_PICKPACK_AREA,
  ).trim()

  const [rateioRows, pickPackRows, users] = await Promise.all([
    sql`
      SELECT
        wms_usuario_id,
        MAX(usuario_nome) AS usuario_nome,
        SUM(total)::numeric AS pontuacao,
        SUM(valor)::numeric AS valor_base
      FROM wms_rateio_registros
      WHERE data_ref = ${date}
      GROUP BY wms_usuario_id
      ORDER BY MAX(usuario_nome)
    `,
    sql`
      SELECT
        MAX(usuario_nome) AS usuario_nome,
        usuario_login,
        COUNT(*)::int AS quantidade
      FROM wms_item_registros
      WHERE CASE
              WHEN entrega ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                THEN LEFT(entrega, 10)::date
              WHEN entrega ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
                THEN TO_DATE(SPLIT_PART(entrega, ' ', 1), 'DD/MM/YYYY')
              ELSE NULL
            END = ${date}
        AND LOWER(TRIM(COALESCE(area_separacao, ''))) =
            LOWER(TRIM(${pickPackArea}))
        AND NULLIF(TRIM(COALESCE(usuario_login, '')), '') IS NOT NULL
      GROUP BY usuario_login
    `,
    sql`
      SELECT
        id,
        nome,
        wms_usuario_id,
        wms_login
      FROM usuarios
      WHERE origem = 'WMS'
         OR perfil = 'Ajudante'
    `,
  ])

  const usersByUuid = new Map()
  const usersByLogin = new Map()
  const usersByName = new Map()

  for (const user of users) {
    if (user.wms_usuario_id) {
      usersByUuid.set(String(user.wms_usuario_id), user)
    }
    if (user.wms_login) {
      usersByLogin.set(normalizeLogin(user.wms_login), user)
    }

    const nameKey = normalizeName(user.nome)
    if (nameKey && !usersByName.has(nameKey)) {
      usersByName.set(nameKey, user)
    }
  }

  const pickPackByLogin = new Map()
  const pickPackByName = new Map()

  for (const row of pickPackRows) {
    const info = {
      quantidade: Number(row.quantidade || 0),
      login: String(row.usuario_login || '').trim() || null,
    }
    const loginKey = normalizeLogin(info.login)
    const nameKey = normalizeName(row.usuario_nome)

    if (loginKey) {
      pickPackByLogin.set(loginKey, info)
    }
    if (nameKey && !pickPackByName.has(nameKey)) {
      pickPackByName.set(nameKey, info)
    }
  }

  let notifications = 0
  let linkedUsers = 0
  const results = []

  for (const rateio of rateioRows) {
    const wmsUsuarioId = String(rateio.wms_usuario_id || '').trim()
    const usuarioNome = String(rateio.usuario_nome || '').trim()
    const pontuacao = Number(rateio.pontuacao || 0)
    const valorBase = roundMoney(Number(rateio.valor_base || 0))

    let user =
      usersByUuid.get(wmsUsuarioId) ||
      usersByName.get(normalizeName(usuarioNome)) ||
      null

    let pickPackInfo =
      (user?.wms_login
        ? pickPackByLogin.get(normalizeLogin(user.wms_login))
        : null) ||
      pickPackByName.get(normalizeName(usuarioNome)) ||
      {
        quantidade: 0,
        login: user?.wms_login || null,
      }

    if (!user && pickPackInfo.login) {
      user = usersByLogin.get(normalizeLogin(pickPackInfo.login)) || null
    }

    if (user) {
      linkedUsers += 1
      await linkWmsIdentity(user, {
        wmsUsuarioId,
        wmsLogin: pickPackInfo.login || user.wms_login,
      })
    }

    const isPickPack = pickPackInfo.quantidade >= 30
    const percentual = isPickPack ? 0 : getEscalonadaPercent(pontuacao)
    const incentivo = roundMoney(valorBase * (percentual / 100))
    const valorTotal = roundMoney(valorBase + incentivo)

    const savedRows = await sql`
      INSERT INTO escalonada_resultados (
        data_ref,
        usuario_id,
        wms_usuario_id,
        wms_login,
        usuario_nome,
        pontuacao,
        valor_base,
        pickpack,
        pickpack_area,
        pickpack_qtd,
        percentual,
        incentivo,
        valor_total,
        atualizado_em
      )
      VALUES (
        ${date},
        ${user?.id ?? null},
        ${wmsUsuarioId},
        ${pickPackInfo.login},
        ${usuarioNome},
        ${pontuacao},
        ${valorBase},
        ${isPickPack},
        ${pickPackArea},
        ${pickPackInfo.quantidade},
        ${percentual},
        ${incentivo},
        ${valorTotal},
        NOW()
      )
      ON CONFLICT (data_ref, wms_usuario_id)
      DO UPDATE SET
        usuario_id = EXCLUDED.usuario_id,
        wms_login = EXCLUDED.wms_login,
        usuario_nome = EXCLUDED.usuario_nome,
        pontuacao = EXCLUDED.pontuacao,
        valor_base = EXCLUDED.valor_base,
        pickpack = EXCLUDED.pickpack,
        pickpack_area = EXCLUDED.pickpack_area,
        pickpack_qtd = EXCLUDED.pickpack_qtd,
        percentual = EXCLUDED.percentual,
        incentivo = EXCLUDED.incentivo,
        valor_total = EXCLUDED.valor_total,
        atualizado_em = NOW()
      RETURNING id
    `

    const resultId = Number(savedRows[0].id)

    if (user?.id && incentivo > 0 && percentual > 0) {
      const title = `Você ganhou ${formatPercent(percentual)} de escalonada!`
      const message =
        `Seu incentivo do dia é ${formatCurrency(incentivo)}. ` +
        `Valor base: ${formatCurrency(valorBase)}. ` +
        `Total do dia: ${formatCurrency(valorTotal)}.`

      await sql`
        INSERT INTO escalonada_notificacoes (
          usuario_id,
          resultado_id,
          titulo,
          mensagem,
          atualizado_em
        )
        VALUES (
          ${user.id},
          ${resultId},
          ${title},
          ${message},
          NOW()
        )
        ON CONFLICT (resultado_id)
        DO UPDATE SET
          usuario_id = EXCLUDED.usuario_id,
          titulo = EXCLUDED.titulo,
          mensagem = EXCLUDED.mensagem,
          atualizado_em = NOW()
      `

      notifications += 1
    } else {
      await sql`
        DELETE FROM escalonada_notificacoes
        WHERE resultado_id = ${resultId}
      `
    }

    results.push({
      usuarioNome,
      pontuacao,
      valorBase,
      percentual,
      incentivo,
      valorTotal,
      pickpack: isPickPack,
      pickpackQtd: pickPackInfo.quantidade,
      usuarioId: user?.id ? Number(user.id) : null,
    })
  }

  return {
    date,
    count: results.length,
    linkedUsers,
    notifications,
    pickPackArea,
    results,
  }
}

export function getEscalonadaPercent(score) {
  const value = Number(score || 0)

  if (value > 60000) return 0
  if (value > 29000) return 100
  if (value > 25000) return 75
  if (value > 21000) return 50
  if (value > 19000) return 25
  return 0
}

async function linkWmsIdentity(user, { wmsUsuarioId, wmsLogin }) {
  try {
    await sql`
      UPDATE usuarios
      SET wms_usuario_id = COALESCE(wms_usuario_id, ${wmsUsuarioId || null}),
          wms_login = COALESCE(wms_login, ${wmsLogin || null}),
          atualizado_em = NOW()
      WHERE id = ${user.id}
    `
  } catch (error) {
    console.warn('wms_identity_link_warning', {
      userId: Number(user.id),
      code: error?.code || null,
    })
  }
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function normalizeLogin(value) {
  return String(value || '').trim().toUpperCase()
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

function formatPercent(value) {
  const number = Number(value || 0)
  return Number.isInteger(number)
    ? `${number}%`
    : `${number.toFixed(2).replace('.', ',')}%`
}
