const WMS_ORIGIN = 'https://wmst2.ambev.com.br'
const LOGIN_PATH = '/wms/new/security/authentication/login-novo'
const RATEIO_PATH = '/api/variable-pay/relatorios/rateio'
const ITEM_REPORT_ID = 57
const WAREHOUSE_PATH = '/wms/new/security/v1/users/warehouses'

export function currentBahiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bahia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `${values.year}-${values.month}-${values.day}`
}

export async function loginWms(username, password) {
  const response = await fetch(`${WMS_ORIGIN}${LOGIN_PATH}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      usuario: String(username || '').trim(),
      senha: String(password || ''),
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(
      payload?.message ||
      payload?.errors?.[0]?.error ||
      'Não foi possível autenticar no WMS.',
    )
    error.code = 'WMS_AUTH_FAILED'
    error.status = response.status
    throw error
  }

  const token = payload?.data?.token
  if (!token) {
    const error = new Error('O WMS não retornou um token de acesso.')
    error.code = 'WMS_TOKEN_MISSING'
    throw error
  }

  return token
}

export async function fetchWmsRateio(token, date = currentBahiaDate()) {
  const start = encodeURIComponent(`${date} 00:00:00`)
  const end = encodeURIComponent(`${date} 23:59:59`)
  const url = `${WMS_ORIGIN}${RATEIO_PATH}?dataInicial=${start}&dataFinal=${end}`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: token,
    },
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(
      payload?.message || 'Não foi possível buscar o Relatório de Rateio.',
    )
    error.code = response.status === 401 ? 'WMS_TOKEN_REJECTED' : 'WMS_RATEIO_FAILED'
    error.status = response.status
    throw error
  }

  const rows = Array.isArray(payload?.data) ? payload.data : []

  return {
    source: url,
    rows: rows.map((item) => ({
      wmsUsuarioId: String(item.idUsuario || ''),
      usuarioNome: String(item.usuarioNome || '').trim(),
      tipo: String(item.tipo || '').trim() || null,
      creditos: Number(item.creditos || 0),
      debitos: Number(item.debitos || 0),
      total: Number(item.total || 0),
      valor: Number(item.valor || 0),
    })),
  }
}

export async function fetchWmsItemReport(token, date = currentBahiaDate()) {
  const context = await fetchWmsContext(token)
  const params = new URLSearchParams({
    initialDateTime: date,
    finalDateTime: date,
    userId: context.userId,
    warehouseId: context.warehouseId,
  })
  const url = `${WMS_ORIGIN}/api/outbound-reports/report/${ITEM_REPORT_ID}/GetData?${params.toString()}`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: token,
    },
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(
      payload?.message || 'Não foi possível buscar o relatório Tempo de Separação por Item.',
    )
    error.code = response.status === 401 ? 'WMS_TOKEN_REJECTED' : 'WMS_ITEM_FAILED'
    error.status = response.status
    throw error
  }

  const rows = Array.isArray(payload?.lines) ? payload.lines : []

  return {
    source: url,
    rows: rows.map((item) => ({
      mapa: textOrNull(item.load_documentnumber_column),
      palete: textOrNull(item.pallet_description_column),
      entrega: textOrNull(item.load_deliverydate_column),
      caixa: textOrNull(item.containeridentification_join_palletitem_column),
      areaSeparacao: textOrNull(item.zone_name_column),
      codigoItem: textOrNull(item.item_code_column_join_pallet),
      itemDescricao: textOrNull(item.item_description_column_join_pallet),
      quantidade: numberOrNull(item.palletitem_quantity_unit_column),
      origem: textOrNull(item.from_location_code_column),
      equipamento: textOrNull(item.to_location_code_column),
      inicioTexto: textOrNull(item.palletitem_startedat_column),
      fimTexto: textOrNull(item.palletitem_finishedat_column),
      duracaoSeg: numberOrNull(item.palletitem_executiontime_column),
      usuarioLogin: textOrNull(item.user_login_column),
      usuarioNome: textOrNull(item.user_name_column),
    })),
  }
}

export async function validateWmsCredentials(username, password) {
  const token = await loginWms(username, password)
  const report = await fetchWmsRateio(token)

  return {
    ok: true,
    count: report.rows.length,
  }
}

async function fetchWmsContext(token) {
  const claims = decodeJwtPayload(token)
  const userId =
    claims.UsuarioId ||
    claims.usuarioId ||
    claims.userId ||
    claims.sub ||
    ''

  const response = await fetch(`${WMS_ORIGIN}${WAREHOUSE_PATH}`, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: token,
    },
  })

  const payload = await response.json().catch(() => null)
  const warehouseId = payload?.data?.loggedWarehouse?.id || ''

  if (!userId || !warehouseId) {
    const error = new Error('Não foi possível identificar usuário e armazém no WMS.')
    error.code = 'WMS_CONTEXT_MISSING'
    throw error
  }

  return { userId: String(userId), warehouseId: String(warehouseId) }
}

function decodeJwtPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '')
    const part = raw.split('.')[1]
    if (!part) return {}

    const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'))
  } catch {
    return {}
  }
}

function textOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
