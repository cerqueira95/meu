import { sql } from './_db.js'
import { directApiStatus, readServiceReports } from './_direct-api.js'
import { validateReportPeriod } from './_period.js'
import { reportWindow, persistCollectorPayload } from './_sync.js'

let processPromise = null
const safeError = err => String(err?.message || 'Falha ao consultar Logan').slice(0, 260)

async function claimPending() {
  const rows = await sql`UPDATE logan_coletas
     SET estado='executando', iniciado_em=NOW(), agente='Render API autorizada',
       mensagem='Consultando relatórios Logan diretamente na API.'
     WHERE id=(SELECT id FROM logan_coletas WHERE estado='pendente'
       ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING id, detalhes`
  return rows[0] || null
}
async function consumeJob(job) {
  try {
    const supplied = job.detalhes?.periodoSolicitado
    const period = supplied
      ? validateReportPeriod(supplied.dateFrom, supplied.dateTo)
      : reportWindow()
    // Do not persist either report until BOTH reports are fetched and validated.
    const payload = await readServiceReports(period)
    const result = await persistCollectorPayload(payload, period)
    await sql`UPDATE logan_coletas SET estado='concluido', concluido_em=NOW(),
       mensagem='Consulta à API Logan concluída com proteção contra duplicidades.',
       detalhes=${sql.json({ ...result, periodo: period, metodo: 'api_render' })}
       WHERE id=${job.id}`
    console.info('logan_direct_job_complete', { id: String(job.id), added: result.inseridos, skipped: result.ignorados })
    return { id: String(job.id), status: 'concluido', ...result }
  } catch (err) {
    const msg = safeError(err)
    await sql`UPDATE logan_coletas SET estado='erro', concluido_em=NOW(), mensagem=${msg}
      WHERE id=${job.id}`
    console.warn('logan_direct_job_failed', { id: String(job.id), code: err?.code || 'LOGAN_DIRECT_FAILED' })
    return { id: String(job.id), status: 'erro' }
  }
}
async function queueScheduledJob() {
  const period = reportWindow()
  // Preserve an operator-initiated manual request already in queue.
  await sql`INSERT INTO logan_coletas(origem, estado, solicitado_por, mensagem, detalhes)
    VALUES('cron','pendente','cron_render',
       'Agendado: consulta direta à API Logan.',
       ${sql.json({periodoSolicitado: period})})
    ON CONFLICT DO NOTHING`
}
export async function processDirectQueue({ scheduled = false } = {}) {
  if (!directApiStatus().enabled) return { enabled: false, reason: 'api_credentials_not_ready' }
  // Recover abandoned tasks only after the current fetch deadline and avoid overlapping.
  await sql`UPDATE logan_coletas SET estado='erro', concluido_em=NOW(),
       mensagem='Tempo limite da execução anterior; confirme o acesso de serviço e tente novamente.'
     WHERE (estado='pendente' AND solicitado_em < NOW()-INTERVAL '15 minutes')
        OR (estado='executando' AND iniciado_em < NOW()-INTERVAL '15 minutes')`
  if (scheduled) await queueScheduledJob()
  const job = await claimPending()
  if (!job) return { enabled: true, claimed: false }
  return { enabled: true, claimed: true, ...(await consumeJob(job)) }
}

// Starts after HTTP 202; Render cron is the fallback if the web process restarts.
export function startDirectQueue() {
  if (!directApiStatus().enabled) return false
  if (!processPromise) {
    processPromise = processDirectQueue()
      .catch(err => console.warn('logan_direct_worker_error', { code: err?.code || 'unknown' }))
      .finally(() => { processPromise = null })
  }
  return true
}
