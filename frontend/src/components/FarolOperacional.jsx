import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import './FarolOperacional.css'

const ZONE = 'America/Bahia'
const TABS = [
  { id: 'resumo', label: 'Visão geral' },
  { id: 'horas', label: 'Por hora' },
  { id: 'equipe', label: 'Ranking da equipe' },
  { id: 'fluxo', label: 'Fluxo de carregamento' },
  { id: 'jornada', label: 'Jornada observada' },
]
const taskNames = {
  separacao: 'Separação', conferencia: 'Conferência',
  carregamento: 'Carregamento', fechamento: 'Fechamento', manobrista: 'Manobrista',
}
function todayBahia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date())
}
function formatNumber(value) { return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }
function timeLabel(value) {
  if (!value || value.length < 16) return '—'
  const [date, time] = value.split('T')
  return (date?.slice(8,10) || '') + '/' + (date?.slice(5,7) || '') + ' ' + (time?.slice(0,5) || '')
}
function hourLabel(value) { return value ? value.slice(8,10) + '/' + value.slice(5,7) + ' ' + value.slice(11,13) + 'h' : '—' }
function downloadedCsv(data) {
  const headers = ['Operador','Paletes','Itens','Unidades','Tarefas','Primeira atividade','Última atividade']
  const rows = (data.ranking || []).map(row => [row.nome,row.paletes,row.itens,row.unidades,row.tarefas,row.primeira || '',row.ultima || ''])
  const text = [headers,...rows].map(row => row.map(value => '"' + String(value ?? '').replaceAll('"','""') + '"').join(';')).join('\r\n')
  const blob = new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const anchor=document.createElement('a')
  anchor.href=url
  anchor.download='Farol_WMS_'+data.periodo.inicio+'_a_'+data.periodo.fim+'.csv'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
function Metric({ label, value, hint, type='neutral', icon='•' }) {
  return <article className={'farol-metric farol-metric-'+type}>
    <div className="farol-metric-top"><span>{label}</span><span className="farol-metric-symbol" aria-hidden="true">{icon}</span></div>
    <strong>{value}</strong><small>{hint}</small>
  </article>
}
function StatusNotice({ data }) {
  const last=data.qualidade?.ultimaData
  const today=todayBahia()
  const stale=!last || last < today
  return <div className={'farol-status-bar '+(stale?'is-stale':'is-fresh')} role="status">
    <div className="farol-status-primary"><span className="farol-status-dot"/>
      <span><strong>{stale?'Dados WMS não atualizados hoje':'Coleta WMS disponível'}</strong>
        <span className="farol-status-small"> Último dia coletado: {last?last.split('-').reverse().join('/'): 'não informado'} · Horário de Bahia</span>
      </span>
    </div>
    <div className="farol-status-tags">
      <span>Paletes: dados WMS por item</span>
      <span className="is-pending">Pontuação: fonte pendente</span>
      <span className={data.qualidade?.tarefasDisponiveis?'is-ready':'is-pending'}>Tarefas: {data.qualidade?.tarefasDisponiveis?'disponíveis':'não integradas'}</span>
    </div>
  </div>
}
function Ranking({ rows, mode='compact' }) {
  const best=rows[0]?.paletes || 1
  return <div className="farol-ranking-list">
    {rows.length===0 && <p className="farol-muted">Nenhuma movimentação no período selecionado.</p>}
    {rows.map((person,index) => <div className="farol-ranking-row" key={person.id || person.nome}>
      <span className="farol-rank-position">{index+1}</span>
      <div className="farol-rank-identity">
        <strong title={person.nome}>{person.nome}</strong>
        <div className="farol-rank-track"><i style={{width:(person.paletes/best*100)+'%'}}/></div>
      </div>
      <span className="farol-rank-value">{formatNumber(person.paletes)} <small>PLTs</small></span>
      {mode==='full' && <span className="farol-rank-extra">{formatNumber(person.itens)} itens</span>}
    </div>)}
  </div>
}
function HourGrid({ rows, hours, metric, onMetric }) {
  const max=Math.max(1,...rows.flatMap(row=>hours.map(h=>h.byName?.[row.id || row.nome]?.[metric]||0)))
  return <>
    <div className="farol-table-toolbar">
      <span>Operadores × horas de finalização</span>
      <div className="farol-segments" role="group" aria-label="Métrica da tabela">
        {[['paletes','Paletes'],['itens','Itens'],['unidades','Unidades']].map(([key,label])=>
          <button key={key} type="button" aria-pressed={metric===key} className={metric===key?'is-active':''} onClick={()=>onMetric(key)}>{label}</button>
        )}
      </div>
    </div>
    <div className="farol-scroll-table">
      <table className="farol-heat-table">
        <thead><tr><th>Operador</th>{hours.map(h=><th key={h.hora}>{hourLabel(h.hora)}</th>)}<th>Total</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.id || row.nome}>
          <td title={row.nome}>{row.nome}</td>
          {hours.map(h=>{
            const n=h.byName?.[row.id || row.nome]?.[metric]||0
            return <td key={h.hora} className={n?'farol-heat-cell':'farol-heat-empty'}
              style={n?{'--farol-heat-alpha':Math.max(.14,Math.min(.8,n/max*.8))}:undefined}>{formatNumber(n)}</td>
          })}
          <td className="farol-heat-total">{formatNumber(row[metric])}</td>
        </tr>)}</tbody>
        <tfoot><tr><td>Total operação</td>{hours.map(h=><td key={h.hora}>{formatNumber(h[metric])}</td>)}<td>{formatNumber(rows.reduce((total,r)=>total+Number(r[metric]||0),0))}</td></tr></tfoot>
      </table>
    </div>
  </>
}
export default function FarolOperacional() {
  const [filters,setFilters]=useState({inicio:todayBahia(),fim:todayBahia(),horaInicio:'00:00',horaFim:'23:59'})
  const [applied,setApplied]=useState(filters)
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [tab,setTab]=useState('resumo')
  const [search,setSearch]=useState('')
  const [metric,setMetric]=useState('paletes')
  const [sort,setSort]=useState('paletes')
  const [syncing,setSyncing]=useState(false)
  const [syncMessage,setSyncMessage]=useState('')
  async function load(period=applied) {
    setError('')
    setLoading(true)
    try {
      const query=new URLSearchParams(period).toString()
      const response=await api.get('/api/farol?'+query)
      setData(response)
      setApplied(period)
    } catch (err) { setError(err?.message || 'Falha ao carregar o Farol do WMS.') }
    finally { setLoading(false) }
  }
  async function syncWms() {
    setSyncMessage('')
    setError('')
    setSyncing(true)
    try {
      const result = await api.post('/api/wms/collect', {})
      setSyncMessage(result.message || 'Coleta WMS concluída.')
      await load()
    } catch (err) {
      setError(err?.message || 'Falha na coleta WMS. Verifique a integração nas configurações.')
    } finally {
      setSyncing(false)
    }
  }
  useEffect(()=>{load(filters)},[]) // initial query only; subsequent filters are explicit
  function apply(event) {
    event.preventDefault()
    if(filters.inicio>filters.fim || (filters.inicio===filters.fim && filters.horaInicio>filters.horaFim)){
      setError('O início deve ser anterior ao fim do período.')
      return
    }
    load(filters)
  }
  const ranking=useMemo(()=>{
    const rows=[...(data?.ranking||[])]
    const q=search.trim().toLocaleLowerCase('pt-BR')
    return rows.filter(row=>!q || row.nome.toLocaleLowerCase('pt-BR').includes(q) || row.id?.toLocaleLowerCase('pt-BR').includes(q))
      .sort((a,b)=>Number(b[sort]||0)-Number(a[sort]||0)||a.nome.localeCompare(b.nome,'pt-BR'))
  },[data,search,sort])
  const hours=useMemo(()=>{
    const groups=new Map()
    for(const item of data?.horas||[])groups.set(item.hora,{...item,byName:item.byName || {}})
    return [...groups.values()]
  },[data])
  const chartMax=Math.max(1,...hours.map(x=>x.paletes))
  const canShowTasks=Boolean(data?.qualidade?.tarefasDisponiveis)
  return <div className="farol-page">
    <div className="farol-heading">
      <div><span className="farol-eyebrow">OPERAÇÃO / WMS / ACOMPANHAMENTO</span>
        <h1>Farol Operacional</h1>
        <p>Separação e carregamento — produtividade por operador, por hora e por período.</p></div>
      <div className="farol-heading-actions">
        <button className="farol-secondary" type="button" disabled={loading||syncing} onClick={()=>load()}>↻ Atualizar painel</button>
        <button className="farol-secondary" type="button" disabled={loading||syncing} onClick={syncWms}>{syncing?'Buscando WMS...':'Sincronizar WMS'}</button>
        <button className="farol-primary" type="button" disabled={!data || loading} onClick={()=>downloadedCsv(data)}>↓ Exportar resumo</button>
      </div>
    </div>
    <form className="farol-filters" onSubmit={apply}>
      {[['inicio','Data inicial','date'],['horaInicio','Hora inicial','time'],['fim','Data final','date'],['horaFim','Hora final','time']].map(([key,label,type])=>
        <label key={key}>{label}<input type={type} value={filters[key]} onChange={e=>setFilters(prev=>({...prev,[key]:e.target.value}))} required/></label>
      )}
      <button className="farol-filter-button" type="submit" disabled={loading}>{loading?'Consultando...':'Aplicar período'}</button>
      <div className="farol-filters-caption">Períodos de até 31 dias</div>
    </form>
    {error&&<div className="farol-alert farol-alert-error" role="alert">{error}</div>}
    {syncMessage&&<div className="farol-alert farol-alert-success" role="status">{syncMessage}</div>}
    {data&&<StatusNotice data={data}/>}
    {data?.qualidade?.limitado&&<div className="farol-alert farol-alert-warning" role="alert">Intervalo muito grande: parte dos registros excedeu o limite de consulta. Reduza o período para obter resultados completos.</div>}
    {data&&<div className="farol-metrics">
      <Metric label="PALETES IDENTIFICADOS" value={formatNumber(data.resumo.paletes)} hint="Paletes distintos por operador" type="teal" icon="▣"/>
      <Metric label="ITENS SEPARADOS" value={formatNumber(data.resumo.itens)} hint="Linhas de itens processadas" icon="≡"/>
      <Metric label="UNIDADES SEPARADAS" value={formatNumber(data.resumo.unidades)} hint="Quantidade registrada no WMS" icon="▤"/>
      <Metric label="OPERADORES ATIVOS" value={formatNumber(data.resumo.operadores)} hint="Com paletes no período" icon="♙"/>
      <Metric label="PONTUAÇÃO / ELA" value="—" hint="Aguardando fonte do relatório por palete" type="warning" icon="◎"/>
    </div>}
    <div className="farol-tabbar" role="tablist" aria-label="Visualizações do Farol">
      {TABS.map(item=><button key={item.id} role="tab" type="button" aria-selected={tab===item.id}
        className={'farol-tab '+(tab===item.id?'active':'')} onClick={()=>setTab(item.id)}>{item.label}</button>)}
    </div>
    {loading&&!data && <div className="farol-empty">Consultando relatórios do WMS...</div>}
    {data&&tab==='resumo'&&<div className="farol-main-grid">
      <section className="farol-panel"><header><div><h2>Ranking de separação</h2><small>Paletes únicos por operador</small></div><span className="farol-count">{ranking.length} nomes</span></header>
        <Ranking rows={ranking.slice(0,10)}/>
      </section>
      <section className="farol-panel"><header><div><h2>Evolução da operação</h2><small>Paletes finalizados por hora</small></div><span className="farol-count">{hours.length} horas</span></header>
        {hours.length? <div className="farol-chart">{hours.map(h=><div key={h.hora} className="farol-chart-column" title={hourLabel(h.hora)+': '+h.paletes+' paletes'}>
          <span className="farol-chart-value">{formatNumber(h.paletes)}</span><div className="farol-chart-track"><i style={{height:Math.max(4,h.paletes/chartMax*100)+'%'}}/></div><small>{hourLabel(h.hora)}</small>
        </div>)}</div>:<p className="farol-muted">Nenhuma separação encontrada no intervalo.</p>}
      </section>
    </div>}
    {data&&tab==='horas'&&<section className="farol-panel farol-wide">
      <header><div><h2>Produtividade horária</h2><small>Quantidade de paletes, itens e unidades por operador e hora</small></div></header>
      <HourGrid rows={ranking} hours={hours} metric={metric} onMetric={setMetric}/>
    </section>}
    {data&&tab==='equipe'&&<section className="farol-panel farol-wide">
      <header><div><h2>Ranking completo</h2><small>Indicadores individuais de separação</small></div>
        <div className="farol-panel-tools"><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar operador..." aria-label="Buscar operador"/>
          <select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Ordenar por">
            <option value="paletes">Paletes</option><option value="itens">Itens</option><option value="unidades">Unidades</option><option value="tarefas">Tarefas</option>
          </select></div></header>
      <div className="farol-scroll-table"><table><thead><tr><th>Operador</th><th>Paletes</th><th>Itens</th><th>Unidades</th><th>Tarefas</th></tr></thead>
        <tbody>{ranking.map(u=><tr key={u.id || u.nome}><td><strong>{u.nome}</strong></td><td>{formatNumber(u.paletes)}</td><td>{formatNumber(u.itens)}</td><td>{formatNumber(u.unidades)}</td><td>{formatNumber(u.tarefas)}</td></tr>)}</tbody></table></div>
    </section>}
    {data&&tab==='fluxo'&&<section className="farol-panel farol-wide">
      <header><div><h2>Fluxo de carregamento</h2><small>Separação, conferência, carregamento e fechamento</small></div></header>
      {canShowTasks?<div className="farol-flow">{Object.entries(taskNames).map(([key,label])=><div key={key}><span>{label}</span><strong>{formatNumber(data.tiposTarefas[key])}</strong><small>tarefas concluídas</small></div>)}</div>:
        <div className="farol-no-source"><strong>Dados de tarefas ainda indisponíveis neste banco.</strong><p>O Warehouse tem a rotina de Monitorar Tarefas no código, mas ela não está persistindo registros aqui. A etapa seguinte é validar o cron de tarefas e associar os tipos de separação, conferência, carregamento, fechamento e manobrista.</p></div>}
    </section>}
    {data&&tab==='jornada'&&<section className="farol-panel farol-wide">
      <header><div><h2>Janela de atividade observada</h2><small>Primeiro início e último fim de separação registrados por operador</small></div></header>
      <p className="farol-inline-warning">Esses horários indicam atividades registradas no WMS. Não representam ponto, descanso ou horas extras.</p>
      <div className="farol-scroll-table"><table><thead><tr><th>Operador</th><th>Primeira atividade</th><th>Última atividade</th><th>Paletes</th></tr></thead>
        <tbody>{ranking.map(u=><tr key={u.id || u.nome}><td>{u.nome}</td><td>{timeLabel(u.primeira)}</td><td>{timeLabel(u.ultima)}</td><td>{formatNumber(u.paletes)}</td></tr>)}</tbody></table></div>
    </section>}
    {data&&<p className="farol-footnote">Fonte: WMS · Tempo de Separação por Item. O Farol preserva os cálculos de pontuação e ELA como pendentes até a identificação da fonte oficial de Pontuação por Palete.</p>}
  </div>
}
