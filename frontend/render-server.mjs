import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { URL } from 'node:url'

const HOST = '0.0.0.0'
const PORT = Number(process.env.PORT || 3000)
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(ROOT_DIR, 'dist')
const MEDIA_DIR = path.join(ROOT_DIR, 'public', 'local-media')
const MAX_BODY_BYTES = 40 * 1024 * 1024

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
  ['/api/wms/settings', './api/wms/settings.js'],
  ['/api/wms/test', './api/wms/test.js'],
  ['/api/wms/collect', './api/wms/collect.js'],
  ['/api/escalonada', './api/escalonada/index.js'],
  ['/api/escalonada/read', './api/escalonada/read.js'],
  ['/api/escalonada/admin', './api/escalonada/admin.js'],
  ['/api/cron/rateio', './api/cron/rateio.js'],
  ['/api/activities/5s', './api/activities/5s.js'],
  ['/api/activities/admin', './api/activities/admin.js'],
  ['/api/activities/notifications', './api/activities/notifications.js'],
])

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

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
  let total = 0

  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) {
      const error = new Error('PAYLOAD_TOO_LARGE')
      error.code = 'PAYLOAD_TOO_LARGE'
      throw error
    }
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

function safePath(baseDir, requestPath) {
  let decoded

  try {
    decoded = decodeURIComponent(requestPath)
  } catch {
    return null
  }

  const target = path.resolve(baseDir, '.' + decoded)
  const relative = path.relative(baseDir, target)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }

  return target
}

async function sendFile(req, res, filePath, cacheControl = 'no-cache') {
  try {
    const stat = await fsp.stat(filePath)
    if (!stat.isFile()) return false

    const ext = path.extname(filePath).toLowerCase()
    res.statusCode = 200
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Cache-Control', cacheControl)

    if (req.method === 'HEAD') {
      res.end()
      return true
    }

    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath)
      stream.on('error', reject)
      stream.on('end', resolve)
      stream.pipe(res)
    })

    return true
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') {
      return false
    }
    throw error
  }
}

async function serveFrontend(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    return false
  }

  if (pathname.startsWith('/local-media/')) {
    const mediaPath = safePath(
      MEDIA_DIR,
      pathname.slice('/local-media'.length),
    )
    if (!mediaPath) return false
    return sendFile(req, res, mediaPath, 'private, max-age=3600')
  }

  const assetPath = safePath(DIST_DIR, pathname)
  if (assetPath) {
    const cacheControl = pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'

    if (await sendFile(req, res, assetPath, cacheControl)) {
      return true
    }
  }

  if (path.extname(pathname)) {
    return false
  }

  return sendFile(req, res, path.join(DIST_DIR, 'index.html'), 'no-cache')
}

async function runApiHandler(req, res, url) {
  const modulePath = routes.get(url.pathname)

  if (!modulePath) {
    return false
  }

  req.query = Object.fromEntries(url.searchParams.entries())
  req.body = await readBody(req)

  const module = await import(modulePath)
  await module.default(req, res)

  if (!res.writableEnded) {
    res.end()
  }

  return true
}

const server = http.createServer(async (req, res) => {
  enhanceResponse(res)
  const url = new URL(
    req.url || '/',
    'http://' + (req.headers.host || HOST + ':' + PORT),
  )

  try {
    if (url.pathname.startsWith('/api/')) {
      const handled = await runApiHandler(req, res, url)

      if (!handled && !res.writableEnded) {
        res.status(404).json({
          status: 'error',
          message: 'Rota da API não encontrada.',
        })
      }
      return
    }

    if (await serveFrontend(req, res, url.pathname)) {
      return
    }

    if (!res.writableEnded) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Não encontrado.')
    }
  } catch (error) {
    console.error('render_server_error', url.pathname, error)

    if (!res.headersSent && !res.writableEnded) {
      const tooLarge = error?.code === 'PAYLOAD_TOO_LARGE'
      res.status(tooLarge ? 413 : 500).json({
        status: 'error',
        message: tooLarge
          ? 'Arquivo ou requisição muito grande.'
          : 'Erro interno do servidor.',
      })
    } else if (!res.writableEnded) {
      res.end()
    }
  }
})

server.listen(PORT, HOST, () => {
  console.log('Warehouse pronto em http://' + HOST + ':' + PORT)
})
