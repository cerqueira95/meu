import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const TIME_ZONE = 'America/Bahia'
const DEBUG_PORT = 9222
const DEBUG_URL = `http://127.0.0.1:${DEBUG_PORT}`
const WMS_REPORT_URL =
  'https://wmst2.ambev.com.br/wmsnew/variable-pay/apportionment-report'
const PROFILE_DIR =
  'C:\\Users\\carla\\AppData\\Local\\WarehouseWMSAutomation'
const ROOT = path.resolve(process.cwd(), 'automation')
const OUTPUT_DIR = path.join(ROOT, 'rateio-output')
const LOG_DIR = path.join(ROOT, 'logs')

function dateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
}
function currentDate() {
  const { year, month, day } = dateParts()
  return `${year}-${month}-${day}`
}

function stamp() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date())
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function debuggerReady() {
  try {
    const response = await fetch(`${DEBUG_URL}/json/version`)
    return response.ok
  } catch {
    return false
  }
}

function chromePath() {
  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
}
async function ensureChrome() {
  if (await debuggerReady()) return

  spawn(
    chromePath(),
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${PROFILE_DIR}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      WMS_REPORT_URL,
    ],
    { detached: true, stdio: 'ignore' },
  ).unref()

  for (let i = 0; i < 30; i += 1) {
    await wait(500)
    if (await debuggerReady()) return
  }

  throw new Error('CHROME_DEBUG_NOT_AVAILABLE')
}

async function getWmsTab() {
  const tabs = await fetch(`${DEBUG_URL}/json/list`).then((r) => r.json())
  const page = tabs.find(
    (tab) => tab.type === 'page' && tab.url.includes('wmst2.ambev.com.br'),
  )
  if (!page) {
    throw new Error('WMS_TAB_NOT_FOUND')
  }

  return page
}

function createCdpClient(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl)
  let nextId = 1
  const pending = new Map()
  const listeners = new Map()

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId
      nextId += 1
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  function on(method, handler) {
    const list = listeners.get(method) || []
    list.push(handler)
    listeners.set(method, list)
  }

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const item = pending.get(message.id)
      if (!item) return

      pending.delete(message.id)

      if (message.error) {
        item.reject(new Error(message.error.message))
      } else {
        item.resolve(message.result)
      }

      return
    }

    for (const handler of listeners.get(message.method) || []) {
      handler(message.params)
    }
  }

  const opened = new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  return {
    ws,
    send,
    on,
    opened,
  }
}
async function fetchReportFromBrowser() {
  await ensureChrome()
  const tab = await getWmsTab()
  const cdp = createCdpClient(tab.webSocketDebuggerUrl)
  await cdp.opened

  let requestId = null
  let responseStatus = null
  let apiUrl = null

  cdp.on('Network.responseReceived', (params) => {
    if (params.response.url.includes('/api/variable-pay/relatorios/rateio')) {
      requestId = params.requestId
      responseStatus = params.response.status
      apiUrl = params.response.url
    }
  })

  await cdp.send('Network.enable')
  await cdp.send('Page.enable')
  await cdp.send('Page.navigate', { url: WMS_REPORT_URL })

  for (let i = 0; i < 60 && !requestId; i += 1) {
    await wait(250)
  }

  if (!requestId) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: 'location.href',
      returnByValue: true,
    })

    cdp.ws.close()

    const currentUrl = state?.result?.value || ''
    if (currentUrl.includes('login') || currentUrl.includes('multiple-realms')) {
      throw new Error('AUTH_REQUIRED')
    }

    throw new Error('REPORT_REQUEST_NOT_FOUND')
  }

  await wait(750)

  if (responseStatus !== 200) {
    cdp.ws.close()
    throw new Error(`REPORT_HTTP_${responseStatus}`)
  }

  const bodyResult = await cdp.send('Network.getResponseBody', {
    requestId,
  })

  cdp.ws.close()

  const raw = bodyResult.base64Encoded
    ? Buffer.from(bodyResult.body, 'base64').toString('utf8')
    : bodyResult.body
  const payload = JSON.parse(raw)
  const rows = Array.isArray(payload?.data) ? payload.data : []

  return {
    apiUrl,
    rows,
  }
}

function csvCell(value) {
  const text = String(value ?? '')
  if (!/[;"\n\r]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function toCsv(rows) {
  const header = [
    'idUsuario',
    'usuarioNome',
    'tipo',
    'creditos',
    'debitos',
    'total',
    'valor',
  ]

  const lines = [header.join(';')]
  for (const row of rows) {
    lines.push(
      [
        row.idUsuario,
        row.usuarioNome,
        row.tipo,
        row.creditos,
        row.debitos,
        row.total,
        row.valor,
      ].map(csvCell).join(';'),
    )
  }

  return lines.join('\n')
}

async function writeOutputs(report) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.mkdir(LOG_DIR, { recursive: true })

  const date = currentDate()
  const jsonPath = path.join(OUTPUT_DIR, `${date}.json`)
  const csvPath = path.join(OUTPUT_DIR, `${date}.csv`)
  const latestPath = path.join(OUTPUT_DIR, 'latest.json')

  const result = {
    capturedAt: new Date().toISOString(),
    timeZone: TIME_ZONE,
    reportDate: date,
    source: report.apiUrl,
    count: report.rows.length,
    rows: report.rows,
  }

  await fs.writeFile(jsonPath, JSON.stringify(result, null, 2), 'utf8')
  await fs.writeFile(csvPath, toCsv(report.rows), 'utf8')
  await fs.writeFile(latestPath, JSON.stringify(result, null, 2), 'utf8')

  return { jsonPath, csvPath, count: report.rows.length }
}

async function log(message) {
  await fs.mkdir(LOG_DIR, { recursive: true })
  const logPath = path.join(LOG_DIR, 'wms-rateio.log')
  await fs.appendFile(logPath, `[${stamp()}] ${message}\n`, 'utf8')
}

async function main() {
  try {
    const report = await fetchReportFromBrowser()
    const saved = await writeOutputs(report)
    await log(`OK | ${saved.count} registros | ${currentDate()}`)
    console.log(
      JSON.stringify({
        status: 'ok',
        reportDate: currentDate(),
        count: saved.count,
        jsonPath: saved.jsonPath,
        csvPath: saved.csvPath,
      }),
    )
  } catch (error) {
    const code = error?.message || 'UNKNOWN_ERROR'
    await log(`ERRO | ${code}`)
    console.error(JSON.stringify({ status: 'error', code }))
    process.exitCode = 1
  }
}

await main()
