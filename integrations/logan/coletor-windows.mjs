// Windows collector for authorized Logan Chrome session. Does not read cookies, passwords or tokens.
import { sql, withTransaction } from '../../frontend/api/logan/_db.js'
import { reportWindow, persistCollectorPayload } from '../../frontend/api/logan/_sync.js'
const CDP='http://127.0.0.1:9235'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const REPORTS=[
 {key:'entradas_saidas',menu:'Entradas e Saídas',path:'/private/report/inbound-outbound',api:'/logan/gates/v1/reports/csv-report/',cols:62},
 {key:'movimentacoes',menu:'Movimentações',path:'/private/report/movements',api:'/logan/gates/v1/reports/vehicle-movements/',cols:19},
]
const br=iso=>iso.split('-').reverse().join('/')
function parseCsv(s) {
 s=s.replace(/^\uFEFF/,'')
 const rows=[];let fields=[],value='',quoted=false
 for(let i=0;i<s.length;i++){
  const c=s[i]
  if(quoted){if(c==='"'&&s[i+1]==='"'){value+='"';i++}else if(c==='"')quoted=false;else value+=c}
  else if(c==='"'&&value==='')quoted=true
  else if(c===';'){fields.push(value);value=''}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;fields.push(value);value='';if(fields.some(v=>v.trim()))rows.push(fields);fields=[]}
  else value+=c
 }
 if(quoted)throw Error('CSV não contém aspas completas')
 if(fields.length||value){fields.push(value);rows.push(fields)}
 return rows
}
function parseReport(content,report) {
 const [headers,...lines]=parseCsv(content)
 if(!headers||headers.length!==report.cols||new Set(headers).size!==headers.length)throw Error('Colunas inesperadas em '+report.menu)
 if(!headers.includes(report.key==='entradas_saidas'?'DT_ENTRADA':'DOCUMENTO_DE_TRANSPORTE'))throw Error('Documento ausente no cabeçalho')
 if(lines.length>10000)throw Error('Arquivo de exportação excede o limite')
 return lines.map((values,index)=>{
  if(values.length!==headers.length)throw Error('Colunas inválidas na linha '+(index+2))
  return Object.fromEntries(headers.map((h,i)=>[h,values[i].trim()]))
 })
}
class Chrome {
 constructor(socket){this.socket=socket;this.seq=0;this.waiting=new Map();this.targetIds=new Map();this.capture=null}
 static async open(){
  const tabs=await(await fetch(CDP+'/json/list',{signal:AbortSignal.timeout(4000)})).json()
  const tab=tabs.find(t=>t.type==='page'&&t.url.startsWith('https://logan.ambev.com.br/private/'))
  if(!tab)throw Error('Abra a janela dedicada do Chrome e faça login no Logan.')
  const w=new WebSocket(tab.webSocketDebuggerUrl)
  await Promise.race([new Promise((resolve,reject)=>{w.addEventListener('open',resolve,{once:true});w.addEventListener('error',reject,{once:true})}),sleep(6000).then(()=>{throw Error('Chrome não respondeu')})])
  const c=new Chrome(w);w.addEventListener('message',e=>c.event(e))
  await c.send('Runtime.enable');await c.send('Network.enable')
  return c
 }
 event(raw){
  const m=JSON.parse(raw.data)
  if(m.id&&this.waiting.has(m.id)){
   const t=this.waiting.get(m.id);this.waiting.delete(m.id);m.error?t.reject(Error(m.error.message)):t.resolve(m.result)
  }
  if(!this.capture)return
  if(m.method==='Network.responseReceived'&&m.params?.response?.url){
   const u=new URL(m.params.response.url)
   if(u.pathname===this.capture.api&&m.params.response.status===200)this.targetIds.set(m.params.requestId,this.capture)
  }
  if(m.method==='Network.loadingFinished'){
   const task=this.targetIds.get(m.params.requestId)
   if(!task)return
   this.targetIds.delete(m.params.requestId)
   this.send('Network.getResponseBody',{requestId:m.params.requestId}).then(body=>{
    if(this.capture!==task)return
    const text=body.base64Encoded?Buffer.from(body.body,'base64').toString('utf8'):body.body
    if(!text||text.length<50)throw Error('CSV não recebido')
    this.capture=null
    task.resolve(text)
   }).catch(()=>{/* One Chrome response body may be unavailable; wait for the next one. */})
  }
 }
 send(method,params={}){
  return new Promise((resolve,reject)=>{
   const id=++this.seq;this.waiting.set(id,{resolve,reject})
   this.socket.send(JSON.stringify({id,method,params}))
   setTimeout(()=>{if(this.waiting.has(id)){this.waiting.delete(id);reject(Error('Timeout do Chrome'))}},12000).unref?.()
  })
 }
 async eval(expression){
  const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails)throw Error('Ação do navegador falhou')
  return r.result?.value
 }
 async until(expr,label,timeout=13000){
  const start=Date.now()
  while(Date.now()-start<timeout){if(await this.eval(expr))return;await sleep(250)}
  throw Error(label)
 }
 async openReport(report){
  if(await this.eval('location.pathname')===report.path)return
  const click=`(()=>{const label=${JSON.stringify(report.menu)};let e=[...document.querySelectorAll(".ant-menu-item")].find(x=>x.innerText.trim()===label);if(!e){document.querySelector("button.hamburguerButton")?.click();document.querySelector(".ant-menu-submenu-title")?.click();e=[...document.querySelectorAll(".ant-menu-item")].find(x=>x.innerText.trim()===label)}if(!e)return false;e.click();return true})()`
  let clicked=await this.eval(click)
  if(!clicked){await sleep(400);clicked=await this.eval(click)}
  if(!clicked)throw Error('Menu '+report.menu+' indisponível')
  await this.until('location.pathname==='+JSON.stringify(report.path),'Navegação não concluída')
  await this.until('Boolean(document.querySelector("input[placeholder=\'Data início\']"))','Filtro de data não carregou')
 }
 async pickRange(period){
  const before=await this.eval('[...document.querySelectorAll(".ant-picker-input input")].map(x=>x.value)')
  if(before?.[0]===br(period.dateFrom)&&before?.[1]===br(period.dateTo))return
  await this.eval('(()=>{document.querySelectorAll(".ant-notification").forEach(e=>e.style.pointerEvents="none");return true})()')
  const p=await this.eval('(()=>{let e=document.querySelector("input[placeholder=\'Data início\']");if(!e)return null;let r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  if(!p)throw Error('Filtro de data não encontrado')
  for(const type of ['mouseMoved','mousePressed','mouseReleased']){
   await this.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})})
  }
  await this.until('document.querySelectorAll(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell").length>0','Calendário indisponível')
  for(const date of [period.dateFrom,period.dateTo]){
   const ok=await this.eval(`(()=>{const e=[...document.querySelectorAll(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell")].find(c=>c.title===${JSON.stringify(date)});if(!e)return false;e.querySelector(".ant-picker-cell-inner")?.click();return true})()`)
   if(!ok)throw Error('Data fora do calendário visível: '+date)
   await sleep(350)
  }
  const selected=await this.eval('[...document.querySelectorAll(".ant-picker-input input")].map(x=>x.value)')
  if(selected?.[0]!==br(period.dateFrom)||selected?.[1]!==br(period.dateTo))throw Error('Datas não foram confirmadas pelo Logan')
 }
 async export(report,period){
  await this.openReport(report)
  await this.pickRange(period)
  const filtered=await this.eval('(()=>{let b=[...document.querySelectorAll("button")].find(x=>x.innerText.trim()==="Filtrar");if(!b)return false;b.click();return true})()')
  if(!filtered)throw Error('Filtrar não encontrado')
  await sleep(1800)
  await this.until('Boolean([...document.querySelectorAll("button")].find(x=>x.innerText.trim()==="Exportar"&&!x.disabled))','Exportação ainda indisponível',20000)
  const promise=new Promise((resolve,reject)=>{
   const task={api:report.api,resolve,reject}
   this.capture=task
   setTimeout(()=>{if(this.capture===task){this.capture=null;reject(Error('Exportação '+report.menu+' excedeu 30 segundos'))}},30000).unref?.()
  })
  const exported=await this.eval('(()=>{let b=[...document.querySelectorAll("button")].find(x=>x.innerText.trim()==="Exportar");if(!b||b.disabled)return false;b.click();return true})()')
  if(!exported)throw Error('Exportar não disponível')
  return parseReport(await promise,report)
 }
 close(){this.socket.close()}
}
async function collect(period){
 const browser=await Chrome.open()
 try{
  const data={}
  for(const report of REPORTS)data[report.key]=await browser.export(report,period)
  return data
 }finally{browser.close()}
}
async function claim(){
 const rows=await sql`UPDATE logan_coletas SET estado='executando', iniciado_em=NOW(),
   agente='Chrome autorizado no Windows',mensagem='Extraindo os dois relatórios do Logan.'
   WHERE id=(SELECT id FROM logan_coletas WHERE estado='pendente' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
   RETURNING id`
 return rows[0]||null
}
async function run(job){
 try{
  const periodo=reportWindow()
  const data=await collect(periodo)
  const saved=await persistCollectorPayload(data,periodo)
  await withTransaction(tx => tx`UPDATE logan_coletas SET estado='concluido', concluido_em=NOW(),
   mensagem='Coleta concluída sem duplicação de registros.',
   detalhes=${tx.json({...saved,periodo})}
   WHERE id=${job.id}`)
  console.log('COLETA_CONCLUIDA',JSON.stringify({id:Number(job.id),inseridos:saved.inseridos,ignorados:saved.ignorados}))
 }catch(error){
  const msg=String(error?.message||'Erro de coleta').slice(0,220)
  await sql`UPDATE logan_coletas SET estado='erro',concluido_em=NOW(), mensagem=${msg} WHERE id=${job.id}`
  console.log('COLETA_ERRO',JSON.stringify({id:Number(job.id),motivo:msg}))
 }
}
async function main(){
 console.log('LOGAN_COLETOR_PRONTO')
 while(true){
  try{
   const job=await claim()
   if(job)await run(job)
   else if(process.argv.includes('--once')){console.log('SEM_TRABALHO');break}
  }catch(error){console.log('FALHA_FILA',error?.code||error?.name||'unknown')}
  if(process.argv.includes('--once'))break
  await sleep(3500)
 }
}
await main()
process.exit(0)
