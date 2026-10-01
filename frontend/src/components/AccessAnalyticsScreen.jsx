import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import './AccessAnalyticsScreen.css'

function todayIso() {
  const now = new Date()
  return now.toISOString().slice(0, 10)
}

function addDays(iso, amount) {
  const date = new Date(iso + 'T12:00:00')
  date.setDate(date.getDate() + amount)
  return date.toISOString().slice(0, 10)
}

function dateLabel(value) {
  if (!value) return '-'
  const date = new Date(String(value).slice(0, 10) + 'T12:00:00')
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

function dateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export default function AccessAnalyticsScreen() {
  const today = useMemo(() => todayIso(), [])
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load(start = from, end = to) {
    setLoading(true)
    setError('')
    try {
      const result = await api.get(
        '/api/analytics/access?from=' + encodeURIComponent(start) + '&to=' + encodeURIComponent(end),
      )
      setData(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (!from || !to || from > to) {
      setError('Selecione um período válido.')
      return
    }
    await load()
  }

  const maxAccess = Math.max(1, ...(data?.dias || []).map((item) => Number(item.acessos || 0)))

  return (
    <section className="access-analytics-page">
      <div className="access-analytics-hero">
        <div>
          <span className="dashboard-kicker">USO DA FERRAMENTA</span>
          <h1>Acessos do time</h1>
          <p>Veja quantas vezes o Warehouse foi aberto e quantas pessoas diferentes utilizaram a ferramenta.</p>
        </div>
      </div>

      <form className="access-analytics-filter" onSubmit={submit}>
        <label>
          <span>Data inicial</span>
          <input type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          <span>Data final</span>
          <input type="date" value={to} max={today} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Carregando...' : 'Aplicar período'}</button>
      </form>

      {error && <div className="activity-message error">{error}</div>}

      <div className="access-analytics-cards">
        <article>
          <span>ACESSOS HOJE</span>
          <strong>{Number(data?.hoje?.acessos || 0).toLocaleString('pt-BR')}</strong>
          <small>aberturas registradas hoje</small>
        </article>
        <article>
          <span>PESSOAS HOJE</span>
          <strong>{Number(data?.hoje?.usuarios_unicos || 0).toLocaleString('pt-BR')}</strong>
          <small>usuários diferentes hoje</small>
        </article>
        <article>
          <span>ACESSOS NO PERÍODO</span>
          <strong>{Number(data?.resumo?.acessos || 0).toLocaleString('pt-BR')}</strong>
          <small>entre {dateLabel(from)} e {dateLabel(to)}</small>
        </article>
        <article>
          <span>PESSOAS NO PERÍODO</span>
          <strong>{Number(data?.resumo?.usuarios_unicos || 0).toLocaleString('pt-BR')}</strong>
          <small>usuários diferentes no período</small>
        </article>
      </div>

      <section className="access-analytics-panel">
        <div className="access-analytics-panel-head">
          <div>
            <span className="dashboard-kicker">MOVIMENTO</span>
            <h2>Acessos por dia</h2>
          </div>
        </div>
        <div className="access-bars">
          {(data?.dias || []).map((item) => (
            <div className="access-bar-row" key={item.data}>
              <span>{dateLabel(item.data)}</span>
              <div className="access-bar-track">
                <i style={{ width: Math.max(4, (Number(item.acessos || 0) / maxAccess) * 100) + '%' }} />
              </div>
              <strong>{item.acessos}</strong>
              <small>{item.usuarios_unicos} pessoa(s)</small>
            </div>
          ))}
          {!loading && !(data?.dias || []).length && <div className="access-analytics-empty">Ainda não há acessos registrados neste período.</div>}
        </div>
      </section>

      <section className="access-analytics-panel">
        <div className="access-analytics-panel-head">
          <div>
            <span className="dashboard-kicker">ENGAJAMENTO</span>
            <h2>Uso por colaborador</h2>
          </div>
        </div>
        <div className="access-analytics-table-wrap">
          <table className="access-analytics-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Cargo / Turno</th>
                <th>Acessos</th>
                <th>Dias ativos</th>
                <th>Último acesso</th>
              </tr>
            </thead>
            <tbody>
              {(data?.usuarios || []).map((item) => (
                <tr key={item.usuario_id}>
                  <td><strong>{item.usuario_nome}</strong></td>
                  <td>{item.cargo || item.perfil || '-'}{item.turno ? ' • ' + item.turno : ''}</td>
                  <td><strong>{item.acessos}</strong></td>
                  <td>{item.dias_ativos}</td>
                  <td>{dateTime(item.ultimo_acesso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
