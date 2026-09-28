import http from 'node:http'
import { URL } from 'node:url'

const HOST = '127.0.0.1'
const PORT = Number(process.env.LOCAL_API_PORT || 3001)

const routes = new Map([
  ['/api/ping', './api/ping.js'],
  ['/api/env-check', './api/env-check.js'],
  ['/api/health', './api/health.js'],
  ['/api/auth/login', './api/auth/login.js'],
  ['/api/auth/logout', './api/auth/logout.js'],
  ['/api/auth/me', './api/auth/me.js'],
  ['/api/auth/quick-login', './api/auth/quick-login.js'],
  ['/api/users', './api/users/index.js'],
  ['/api/users/update', './api/users/update.js'],
  ['/api/profile/photo', './api/profile/photo.js'],
  ['/api/media/upload', './api/media/upload.js'],
  ['/api/news', './api/news/index.js'],
  ['/api/news/comment', './api/news/comment.js'],
  ['/api/news/react', './api/news/react.js'],
  ['/api/news/read', './api/news/read.js'],
  ['/api/news/manage-post', './api/news/manage-post.js'],
  ['/api/news/manage-comment', './api/news/manage-comment.js'],
])
function enhanceResponse(res) {
  res.status = (code) => {
    res.statusCode = code
    return res
  }

  res.json = (payload) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    res.end(JSON.stringify(payload))
    return res
  }

  res.send = (payload = '') => {
    if (typeof payload === 'object' && payload !== null) {
      return res.json(payload)
    }
    res.end(String(payload))
    return res
  }

  return res
}
async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined
  }

  const chunks = []

  for await (const chunk of req) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  const buffer = Buffer.concat(chunks)
  const contentType = String(req.headers['content-type'] || '')

  if (contentType.includes('application/json')) {
    const raw = buffer.toString('utf8')
    return raw ? JSON.parse(raw) : {}
  }

  return buffer
}
const server = http.createServer(async (req, res) => {
  enhanceResponse(res)

  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || `${HOST}:${PORT}`}`,
  )
  const modulePath = routes.get(url.pathname)

  if (!modulePath) {
    return res.status(404).json({
      status: 'error',
      message: 'Rota local não encontrada.',
    })
  }

  try {
    req.query = Object.fromEntries(url.searchParams.entries())
    req.body = await readBody(req)

    const module = await import(modulePath)
    await module.default(req, res)

    if (!res.writableEnded) {
      res.end()
    }
  } catch (error) {
    console.error('local_api_error', url.pathname, error)

    if (!res.headersSent && !res.writableEnded) {
      res.status(500).json({
        status: 'error',
        message: 'Erro no servidor local.',
      })
    } else if (!res.writableEnded) {
      res.end()
    }
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Local API pronta em http://${HOST}:${PORT}`)
})