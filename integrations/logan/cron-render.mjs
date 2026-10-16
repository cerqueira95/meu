import { directApiStatus } from '../../frontend/api/logan/_direct-api.js'
import { processDirectQueue } from '../../frontend/api/logan/_direct-worker.js'
const mode = process.argv.includes('--schedule') ? 'scheduled' : 'pending'
const status = directApiStatus()
if (!status.enabled) {
  console.log(JSON.stringify({status:'disabled',mode,reason:'Logan service credentials not configured/approved',missing:status.missing}))
  process.exit(0)
}
try {
  const result = await processDirectQueue({scheduled:mode==='scheduled'})
  console.log(JSON.stringify({status:'completed',mode,result}))
} catch (error) {
  console.error('logan_render_cron_failed', {code:error?.code||'UNKNOWN',message:'See secure service logs'})
  process.exitCode=1
}
