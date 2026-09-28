const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(body?.message ?? 'Erro ao acessar a API.')
    error.status = response.status
    error.data = body
    throw error
  }

  return body
}

export const api = {
  get(path, options = {}) {
    return request(path, {
      ...options,
      method: 'GET',
    })
  },

  post(path, data, options = {}) {
    return request(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}
