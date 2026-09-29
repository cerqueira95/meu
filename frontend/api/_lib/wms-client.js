const WMS_ORIGIN = 'https://wmst2.ambev.com.br'
const LOGIN_PATH = '/wms/new/security/authentication/login-novo'
const RATEIO_PATH = '/api/variable-pay/relatorios/rateio'

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

export async function validateWmsCredentials(username, password) {
  const token = await loginWms(username, password)
  const report = await fetchWmsRateio(token)

  return {
    ok: true,
    count: report.rows.length,
  }
}
