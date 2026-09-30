const WMS_ORIGIN = 'https://wmst2.ambev.com.br'
const LOGIN_PATH = '/wms/new/security/authentication/login-novo'
const RATEIO_PATH = '/api/variable-pay/relatorios/rateio'
const ITEM_REPORT_PATH = '/wms/api-gateway/separacao/tempo-separacao/item-separado'
const TASKS_PATH = '/api/task-management/v2/work-tasks:paginated'

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
  const itemsByPage = 5000
  const first = await fetchLegacyItemReportPage(token, date, 1, itemsByPage)
  const totalItems = Number(first.payload?.data?.totalItens || 0)
  const rows = Array.isArray(first.payload?.data?.itens)
    ? [...first.payload.data.itens]
    : []
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsByPage))

  for (let page = 2; page <= totalPages; page += 1) {
    const current = await fetchLegacyItemReportPage(
      token,
      date,
      page,
      itemsByPage,
    )
    if (Array.isArray(current.payload?.data?.itens)) {
      rows.push(...current.payload.data.itens)
    }
  }

  return {
    source: first.url,
    rows: rows.map((item) => ({
      mapa: textOrNull(item.mapa),
      palete: textOrNull(item.palete),
      entrega: textOrNull(item.dataEntrega),
      caixa: null,
      areaSeparacao: textOrNull(item.areaSeparacao),
      codigoItem: textOrNull(item.codigoItem),
      itemDescricao: textOrNull(item.item),
      quantidade: numberOrNull(item.quantidade),
      origem: textOrNull(item.origem),
      equipamento: textOrNull(item.destino),
      inicioTexto: textOrNull(item.dataHoraInicio),
      fimTexto: textOrNull(item.dataHoraFim),
      duracaoSeg: durationToSeconds(item.esforco),
      usuarioLogin: textOrNull(item.usuario),
      usuarioNome: null,
    })),
  }
}

export async function fetchWmsTasks(token, date = currentBahiaDate()) {
  const itemsByPage = 100
  const first = await fetchWmsTasksPage(token, date, 1, itemsByPage)
  const rows = [...first.rows]
  const totalItems = Number(first.payload?.totalItems || rows.length)
  const totalPages = Math.max(
    1,
    Number(first.payload?.totalPages || Math.ceil(totalItems / itemsByPage) || 1),
  )

  for (let page = 2; page <= totalPages; page += 1) {
    const current = await fetchWmsTasksPage(token, date, page, itemsByPage)
    rows.push(...current.rows)
  }

  return {
    source: first.url,
    rows,
  }
}

async function fetchWmsTasksPage(token, date, page, itemsByPage) {
  const params = new URLSearchParams({
    _Size: String(itemsByPage),
    _Page: String(page),
    _Order: 'CreatedDateInfo DESC',
    startDate: `${date} 00:00:00`,
    endDate: `${date} 23:59:59`,
  })

  const url = `${WMS_ORIGIN}${TASKS_PATH}?${params.toString()}`
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: token,
    },
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload || typeof payload !== 'object') {
    const error = new Error(
      payload?.message || 'Não foi possível buscar o Monitorar Tarefas do WMS.',
    )
    error.code = response.status === 401 ? 'WMS_TOKEN_REJECTED' : 'WMS_TASK_FAILED'
    error.status = response.status
    throw error
  }

  const data = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.items)
      ? payload.items
      : []

  return {
    url,
    payload,
    rows: data.map((item) => ({
      id: textOrNull(item.id),
      documentNumber: textOrNull(item.documentNumber),
      fromLocationCode: textOrNull(item.fromLocationCode),
      locationCode: textOrNull(item.locationCode),
      palletDescription: textOrNull(item.palletDescription),
      status: textOrNull(item.status),
      statusId: numberOrNull(item.statusId),
      workType: textOrNull(item.workType),
      userName: textOrNull(item.userName),
      createdDateInfo: textOrNull(item.createdDateInfo),
      lastAssociationDate: textOrNull(item.lastAssociationDate),
      releaseDate: textOrNull(item.releaseDate),
      updatedDate: textOrNull(item.updatedDate),
      truckPlate: textOrNull(item.truckPlate),
      trailerPlate: textOrNull(item.trailerPlate),
      sequenceId: textOrNull(item.sequenceId),
      priority: textOrNull(item.priority),
    })),
  }
}

async function fetchLegacyItemReportPage(token, date, page, itemsByPage) {
  const [year, month, day] = String(date).split('-').map(Number)
  const legacyDate = `${year}-${month}-${day} 0:00:00`
  const params = new URLSearchParams({
    usuarioId: '',
    documento: '',
    palete: '',
    item: '',
    destino: '',
    itensPorPagina: String(itemsByPage),
    paginaAtual: String(page),
    dataInicio: legacyDate,
    dataFinal: legacyDate,
  })
  const url = `${WMS_ORIGIN}${ITEM_REPORT_PATH}?${params.toString()}`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: token,
    },
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.data) {
    const error = new Error(
      payload?.message || 'Não foi possível buscar o relatório Tempo de Separação por Item.',
    )
    error.code = response.status === 401 ? 'WMS_TOKEN_REJECTED' : 'WMS_ITEM_FAILED'
    error.status = response.status
    throw error
  }

  return { url, payload }
}

function durationToSeconds(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d+):(\d{2}):(\d{2})$/)
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
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
