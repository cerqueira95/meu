import test from 'node:test'
import assert from 'node:assert/strict'
import { directApiStatus, buildReportUrl, parseLoganCsv, readServiceReports, reportDefinitions } from '../../frontend/api/logan/_direct-api.js'
import { validateCollectorPayload } from '../../frontend/api/logan/_sync.js'

const env = {
  LOGAN_DIRECT_ENABLED:'true',
  LOGAN_API_STRUCTURE_ID:'test-structure',
  LOGAN_API_LOCATIONS:'test-location',
  LOGAN_API_SERVICE_TOKEN:'TEST_TOKEN_NOT_REAL',
}
const period = { dateFrom:'2026-09-30', dateTo:'2026-10-01', timezone:'America/Bahia' }
function sample(kind) {
  const primary = kind==='entradas_saidas' ? 'DT_ENTRADA' : 'DOCUMENTO_DE_TRANSPORTE'
  const fields = [primary, 'PLACA', ...Array.from({length:kind==='entradas_saidas'?60:17},(_,i)=>'CAMPO_'+i)]
  const row = [kind==='entradas_saidas' ? '10001' : '12345', 'TEST123', ...fields.slice(2).map((x,i)=>i===0?'"hello; world"':'teste')]
  return fields.join(';')+'\r\n'+row.join(';')+'\r\n'
}
test('disabled when no permitted integration identity', ()=>{
  assert.equal(directApiStatus({}).enabled,false)
  assert.equal(directApiStatus(env).enabled,true)
  assert.equal(reportDefinitions.length,2)
})
test('dates and observed read-only query parameters', ()=>{
  const url=buildReportUrl({path:reportDefinitions[0].path,filter:'document'},period,env)
  assert.equal(url.protocol,'https:')
  assert.equal(url.hostname,'logan.ambev.com.br')
  assert.equal(url.searchParams.get('_minEventTime'),'2026-09-30')
  assert.equal(url.searchParams.get('_maxEventTime'),'2026-10-01')
  assert.equal(url.searchParams.get('locationTimeZone'),'America/Bahia')
})
test('CSV is parsed in memory, preserves quoted semicolon; accepted by shared validator',()=>{
  const reports={}
  for(const kind of ['entradas_saidas','movimentacoes']){
    const def = {type:kind,cols:kind==='entradas_saidas'?62:19,required:kind==='entradas_saidas'?'DT_ENTRADA':'DOCUMENTO_DE_TRANSPORTE'}
    reports[kind]=parseLoganCsv(sample(kind),def)
    assert.equal(reports[kind].length,1)
    assert.equal(reports[kind][0].CAMPO_0,'hello; world')
  }
  const normalized = validateCollectorPayload(reports)
  assert.equal(normalized[0].rows.length,1)
  assert.equal(normalized[1].rows.length,1)
})
test('two API exports happen without touching Chrome or filesystem',async()=>{
  let calls = 0
  const fetcher=async (url,opts)=>{
    calls++
    assert.equal(opts.headers.Authorization, 'Bearer TEST_TOKEN_NOT_REAL')
    assert.equal(url.hostname,'logan.ambev.com.br')
    assert.equal(url.searchParams.get('_minEventTime'),period.dateFrom)
    const type=url.pathname.includes('vehicle-movements')?'movimentacoes':'entradas_saidas'
    return { ok:true,status:200,headers:{get:()=>null},text:async()=>sample(type) }
  }
  const reports=await readServiceReports(period,{env,fetcher})
  assert.equal(calls,2)
  assert.equal(reports.entradas_saidas.length,1)
  assert.equal(reports.movimentacoes.length,1)
})
test('401 fails instead of persisting unauthenticated output',async()=>{
  await assert.rejects(()=>readServiceReports(period,{env,fetcher:async()=>({ok:false,status:401})}),/sem autorização/)
})
