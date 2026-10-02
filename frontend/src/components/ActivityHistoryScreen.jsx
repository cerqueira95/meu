import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import './ActivityHistoryScreen.css'

function todayBahia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function monthStart() { return todayBahia().slice(0, 8) + '01' }
function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function date(value) { if (!value) return ''; return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(String(value).slice(0, 10) + 'T12:00:00')) }
function dateTime(value) { if (!value) return ''; return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }

export default function ActivityHistoryScreen({ currentUser }) {
  const isAdmin = String(currentUser?.perfil || '').toUpperCase() === 'ADM'
  const [filters, setFilters] = useState({ from: monthStart(), to: todayBahia(), status: 'todos', activity: '', user_id: '' })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => { load() }, [])

  async function load(event) {
    event?.preventDefault()
    setLoading(true); setError('')
    try {
      const q = new URLSearchParams(filters)
      const response = await api.get('/api/activities/history?' + q.toString())
      setData(response)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  async function downloadReport() {
    setDownloading(true); setError('')
    try {
      const q = new URLSearchParams({ mode: 'report', from: filters.from, to: filters.to })
      const response = await fetch('/api/activities/history?' + q.toString(), { credentials: 'include' })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.message || 'Não foi possível gerar o relatório.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'relatorio-rv-' + filters.from + '-a-' + filters.to + '.xlsx'
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e.message) } finally { setDownloading(false) }
  }

  const counts = useMemo(() => {
    const list = data?.lancamentos || []
    return {
      total: list.length,
      approved: list.filter((x) => x.status === 'aprovado').length,
      rejected: list.filter((x) => x.status === 'reprovado').length,
    }
  }, [data])

  return (
    <section className="activity-history-page">
      <div className="activity-history-hero">
        <div>
          <span className="dashboard-kicker">ATIVIDADES • HISTÓRICO</span>
          <h1>{isAdmin ? 'Histórico da equipe' : 'Meu histórico'}</h1>
          <p>{isAdmin ? 'Consulte tudo o que foi aprovado ou reprovado e exporte a RV consolidada.' : 'Consulte as atividades aprovadas ou reprovadas em que você participou.'}</p>
        </div>
        {isAdmin && <button className="history-export" type="button" onClick={downloadReport} disabled={downloading}>{downloading ? 'Gerando XLSX...' : '↓ Baixar relatório XLSX'}</button>}
      </div>

      <form className="history-filters" onSubmit={load}>
        <label>De<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label>Até<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <label>Status<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="todos">Aprovados e reprovados</option><option value="aprovado">Aprovados</option><option value="reprovado">Reprovados</option></select></label>
        <label>Atividade<select value={filters.activity} onChange={(e) => setFilters({ ...filters, activity: e.target.value })}><option value="">Todas</option>{(data?.atividades || []).map((x) => <option key={x.chave} value={x.chave}>{x.nome}</option>)}</select></label>
        {isAdmin && <label>Usuário<select value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}><option value="">Todos</option>{(data?.usuarios || []).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>}
        <button type="submit">Aplicar filtros</button>
      </form>

      {error && <div className="activity-message error">{error}</div>}
      <div className="history-summary">
        <article><small>REGISTROS</small><strong>{counts.total}</strong></article>
        <article><small>APROVADOS</small><strong>{counts.approved}</strong></article>
        <article><small>REPROVADOS</small><strong>{counts.rejected}</strong></article>
      </div>

      {loading ? <div className="activities-loading">Carregando histórico...</div> : (data?.lancamentos || []).length === 0 ? (
        <div className="history-empty">Nenhuma atividade encontrada nesse período.</div>
      ) : (
        <div className="history-list">
          {data.lancamentos.map((batch) => (
            <article className="history-card" key={batch.id}>
              <div className="history-card-top">
                <div><span className={'history-status ' + batch.status}>{batch.status === 'aprovado' ? 'Aprovado' : 'Reprovado'}</span><h2>{batch.atividade_nome}</h2><small>#{batch.id} • {date(batch.data_atividade)}</small></div>
                <strong>{money(isAdmin ? batch.valor_grupo : batch.valor_individual)}</strong>
              </div>
              <div className="history-meta">
                <span><b>Participantes:</b> {batch.participantes.map((p) => p.usuario_nome).join(', ') || '—'}</span>
                {batch.status === 'aprovado' ? <span><b>Aprovado por:</b> {batch.aprovado_por_nome || '—'} • {dateTime(batch.aprovado_em)}</span> : <span><b>Reprovado por:</b> {batch.reprovado_por_nome || '—'} • {dateTime(batch.reprovado_em)}</span>}
                {batch.status === 'reprovado' && batch.motivo_reprovacao && <span className="history-reason"><b>Motivo:</b> {batch.motivo_reprovacao}</span>}
              </div>
              {batch.itens.some((item) => item.evidencia_foto) && <div className="history-photos">{batch.itens.filter((item) => item.evidencia_foto).map((item) => <button type="button" key={item.id} onClick={() => setLightbox({ src: item.evidencia_foto, title: item.opcao_nome })}><img src={item.evidencia_foto} alt="" /><span>{item.opcao_nome}</span></button>)}</div>}
            </article>
          ))}
        </div>
      )}

      {lightbox && <div className="history-lightbox" onClick={() => setLightbox(null)}><div onClick={(e) => e.stopPropagation()}><header><strong>{lightbox.title}</strong><button type="button" onClick={() => setLightbox(null)}>×</button></header><img src={lightbox.src} alt={lightbox.title} /></div></div>}
    </section>
  )
}
