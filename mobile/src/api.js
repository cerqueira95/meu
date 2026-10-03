import { API_URL } from './config'

let authToken = ''

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export function setAuthToken(token) {
  authToken = String(token || '')
}

export function clearAuthToken() {
  authToken = ''
}

export async function apiRequest(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers || {}),
  }

  let response

  try {
    response = await fetch(API_URL + path, {
      ...options,
      headers,
    })
  } catch {
    throw new ApiError(
      'Não foi possível conectar ao servidor do Warehouse. Verifique sua internet.',
      0,
    )
  }

  const raw = await response.text()
  let payload = null

  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.message || 'Não foi possível concluir a operação.',
      response.status,
      payload,
    )
  }

  return payload
}

export function login(cpf, senha) {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ cpf, senha }),
  })
}

export function loadMe() {
  return apiRequest('/api/auth/me')
}

export function loadActivityCatalog() {
  return apiRequest('/api/activities/catalog')
}

export function loadWalletSummary(inicio, fim) {
  return apiRequest(
    `/api/wallet/summary?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`,
  )
}

export function loadActivity(path) {
  return apiRequest(path)
}

export function submitActivity(path, payload) {
  return apiRequest(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
