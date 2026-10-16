import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { isAuthorizedWmsCron } from './wms-cron-auth.js'

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({format:'jwk'}), kid:'oidc-test-key', alg:'RS256', use:'sig' }
const issued = Math.floor(Date.now() / 1000)
const base = {
  iss:'https://token.actions.githubusercontent.com',
  aud:'warehouse-orion-wms-cron',
  repository:'cerqueira95/meu',
  repository_id:'841201999',
  ref:'refs/heads/main',
  workflow_ref:'cerqueira95/meu/.github/workflows/rateio-cron.yml@refs/heads/main',
  sub:'repo:cerqueira95/meu:ref:refs/heads/main',
  event_name:'schedule',
  iat:issued, nbf:issued-2, exp:issued+250,
}
const keys = async (url, opts) => {
  assert.equal(new URL(url).hostname,'token.actions.githubusercontent.com')
  assert.equal(opts.method,'GET')
  return {ok:true, text:async()=>JSON.stringify({keys:[jwk]})}
}
function jwt(overrides = {}) {
  const header = Buffer.from(JSON.stringify({alg:'RS256',kid:'oidc-test-key',typ:'JWT'})).toString('base64url')
  const payload = Buffer.from(JSON.stringify({...base,...overrides})).toString('base64url')
  const unsigned = header+'.'+payload
  return unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),privateKey).toString('base64url')
}
const req=token=>({headers:{authorization:'Bearer '+token}})
test('rejects missing and invalid authorization',async()=>{
  assert.equal(await isAuthorizedWmsCron({headers:{}},{env:{},fetcher:keys}),false)
  assert.equal(await isAuthorizedWmsCron(req('invalid'),{env:{},fetcher:keys}),false)
})
test('supports legacy CRON_SECRET safely during migration',async()=>{
  assert.equal(await isAuthorizedWmsCron(req('test-shared-secret'),{env:{CRON_SECRET:'test-shared-secret'},fetcher:keys}),true)
  assert.equal(await isAuthorizedWmsCron(req('wrong'),{env:{CRON_SECRET:'test-shared-secret'},fetcher:keys}),false)
})
test('accepts correctly signed and scoped GitHub identity',async()=>{
  assert.equal(await isAuthorizedWmsCron(req(jwt()),{env:{},fetcher:keys}),true)
})
test('accepts GitHub push to the workflow path on main for rollout',async()=>{
  assert.equal(await isAuthorizedWmsCron(req(jwt({event_name:'push'})),{env:{},fetcher:keys}),true)
})
test('rejects wrong repository, branch, audience, workflow and event',async()=>{
  for(const patch of [
    {repository:'other/repo'}, {repository_id:'999'}, {aud:'another-app'},
    {ref:'refs/heads/dev-local'}, {workflow_ref:'cerqueira95/meu/.github/workflows/other.yml@refs/heads/main'},
    {event_name:'pull_request'}, {sub:'repo:other/repo:ref:refs/heads/main'},
    {exp:issued-1000},
  ])assert.equal(await isAuthorizedWmsCron(req(jwt(patch)),{env:{},fetcher:keys}),false,JSON.stringify(patch))
})
test('rejects valid-looking but unsigned/tampered identity',async()=>{
  const signed = jwt()
  const parts=signed.split('.')
  const tampered = [parts[0],parts[1],Buffer.from('invalid signature').toString('base64url')].join('.')
  assert.equal(await isAuthorizedWmsCron(req(tampered),{env:{},fetcher:keys}),false)
})
