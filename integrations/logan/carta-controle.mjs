// Regras da Carta Controle TMA portadas do PHP. Sem acesso ao banco ou ao navegador.
const TZ = 'America/Bahia'
export const METAS = Object.freeze({ efa: 4800, tma: 7200, anomalia: 14400 })
const fixa = new Set(['HORIZONTE','OPERALOG','LOG20'])
export function dataLogan(value) {
 const s = String(value ?? '').trim()
 if (!s || /^null$|^0000-00-00/.test(s)) return null
 const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/)
 const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
 const p=m ? [m[3],m[2],m[1],m[4]??'00',m[5]??'00',m[6]??'00'] : iso ? [iso[1],iso[2],iso[3],iso[4]??'00',iso[5]??'00',iso[6]??'00'] : null
 if (!p) return null
 const [y,mo,d,h,mi,se]=p.map(Number)
 const utc=new Date(Date.UTC(y,mo-1,d,h+3,mi,se))
 // Rejeita datas impossíveis, por exemplo 31/02.
 const check=new Date(Date.UTC(y,mo-1,d,h,mi,se))
 if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d||h>23||mi>59||se>59)return null
 return utc
}
export function diferencaSegundos(a,b){
 return a&&b&&b>=a ? (b.getTime()-a.getTime())/1000 : null
}
export function turnoDeEntrada(data) {
 if(!data)return 'C'
 const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',hourCycle:'h23'}).format(data))
 return h>=6&&h<14?'A':h>=14&&h<22?'B':'C'
}
export function cartaControle(entradas,movimentacoes,{inicio=null,fim=null,turno=''}={}){
 const porDocumento=new Map()
 for(const m of movimentacoes){
  if(String(m.PROCESSO??'').trim().toUpperCase()!=='EMPURRADA')continue
  const doc=String(m.DOCUMENTO_DE_TRANSPORTE??'').trim()
  if(!doc)continue
  const atual=porDocumento.get(doc)
  const time=dataLogan(m.DATA_ENTRADA)?.getTime()??0
  if(!atual||(time>=(dataLogan(atual.DATA_ENTRADA)?.getTime()??0)))porDocumento.set(doc,m)
 }
 const detalhes=[]
 for(const e of entradas){
  const doc=String(e.DT_ENTRADA??'').trim()
  const m=porDocumento.get(doc)
  if(!doc||!m)continue
  const de=dataLogan(e.DATA_ENTRADA),ds=dataLogan(e.DATA_SAIDA)
  if(!de)continue
  const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(de)
  const local=Object.fromEntries(localDay.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))
  const dia=local.year+'-'+local.month+'-'+local.day
  if((inicio&&dia<inicio)||(fim&&dia>fim))continue
  const t=turnoDeEntrada(de)
  if(turno&&t!==turno)continue
  const ti=dataLogan(m.ENTRADA_RAIO)??dataLogan(m.DATA_ENTRADA)??dataLogan(m.VEICULO_LIBERADO)
  const tf=dataLogan(m.DATA_SAIDA)??dataLogan(m.SAIDA_RAIO)
  const efa=diferencaSegundos(de,ds),tma=diferencaSegundos(ti,tf)
  const transportadora=String(e.TRANSPORTADORA??'').trim()
  detalhes.push({documento:doc,placa:e.PLACA??'',carreta:e.PLACA_CARRETA_ENTRADA??'',transportadora,motorista:e.NOME_MOTORISTA??'',categoria:fixa.has(transportadora.toUpperCase())?'Frota Fixa':'Spot',turno:t,efaSegundos:efa,tmaSegundos:tma,acimaMeta:tma!==null&&tma>METAS.tma,emAtendimento:tma===null,inicioTma:ti?.toISOString()??null,fimTma:tf?.toISOString()??null})
 }
 const avg=(rows,key)=>{const nums=rows.map(x=>x[key]).filter(x=>x!==null);return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null}
 const resumo=rows=>({total:rows.length,efaMedia:avg(rows,'efaSegundos'),tmaMedio:avg(rows,'tmaSegundos'),acimaMeta:rows.filter(x=>x.acimaMeta).length,emAtendimento:rows.filter(x=>x.emAtendimento).length})
 return {resumo:resumo(detalhes),categorias:Object.fromEntries(['Frota Fixa','Spot'].map(c=>[c,{...resumo(detalhes.filter(x=>x.categoria===c)),turnos:Object.fromEntries(['A','B','C'].map(t=>[t,resumo(detalhes.filter(x=>x.categoria===c&&x.turno===t))]))}])),detalhes}
}
