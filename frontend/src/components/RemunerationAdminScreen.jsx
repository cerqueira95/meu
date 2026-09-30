import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function dateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function statusLabel(status) {
  if (status === 'fechado') return 'Fechado'
  if (status === 'conferido') return 'Conferido'
  return 'Aberto'
}

export default function RemunerationAdminScreen() {
  const [month, setMonth] = useState(currentMonth())
  const [tab, setTab] = useState('painel')
  const [data, setData] = useState(null)
  const [audit, setAudit] = useState([])
  const [reprocessDate, setReprocessDate] = useState(today())
  const [reprocessOrigin, setReprocessOrigin] = useState('ambos')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadDashboard()
  }, [month])

  useEffect(() => {
    if (tab === 'auditoria' && audit.length === 0) loadAudit()
  }, [tab])

  async function loadDashboard() {
    setLoading(true)
    setError('')
    try {
      const result = await api.get(
        `/api/admin/remuneration?mes=${encodeURIComponent(month)}`,
      )
      setData(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadAudit() {
    setError('')
    try {
      const result = await api.get('/api/admin/remuneration?mode=audit&limit=150')
      setAudit(result.logs || [])
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function runAction(action, payload = {}) {
    setBusy(action)
    setError('')
    setMessage('')
    try {
      const result = await api.post('/api/admin/remuneration', {
        action,
        ...payload,
      })
      setMessage(result.message || 'Operação concluída.')
      await loadDashboard()
      if (tab === 'auditoria') await loadAudit()
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setBusy('')
    }
  }

  async function handleReprocess(event) {
    event.preventDefault()
    await runAction('reprocessar', {
      data: reprocessDate,
      origem: reprocessOrigin,
    })
  }

  const dashboard = data?.dashboard
  const resumo = dashboard?.resumo || {}
  const alerts = data?.alertas || []
  const closures = data?.fechamentos || []
  const currentClosure = dashboard?.fechamento || { status: 'aberto' }

  const topUsers = useMemo(
    () => (dashboard?.usuarios || []).slice(0, 20),
    [dashboard],
  )

  if (loading && !data) {
    return <div className="activities-loading">Carregando gestão da remuneração...</div>
  }

  return (
    <section style={s.page}>
      <div style={s.hero}>
        <div>
          <span className="dashboard-kicker">GESTÃO • REMUNERAÇÃO</span>
          <h1 style={s.title}>Central de remuneração</h1>
          <p style={s.subtitle}>
            Painel gerencial, reprocessamento, fechamento mensal, alertas e auditoria administrativa.
          </p>
        </div>
        <label style={s.monthField}>
          <span>Mês analisado</span>
          <input
            style={s.input}
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
      </div>

      <div style={s.tabs}>
        {[
          ['painel', 'Painel'],
          ['integracoes', 'Integrações e alertas'],
          ['fechamento', 'Fechamento mensal'],
          ['auditoria', 'Auditoria'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            style={{ ...s.tab, ...(tab === id ? s.tabActive : {}) }}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="activity-message error">{error}</div>}
      {message && <div className="activity-message success">{message}</div>}

      {tab === 'painel' && (
        <>
          <div style={s.statusRow}>
            <div>
              <span style={s.label}>STATUS DO MÊS</span>
              <strong style={s.statusText}>{statusLabel(currentClosure.status)}</strong>
            </div>
            <div>
              <span style={s.label}>COLABORADORES</span>
              <strong style={s.statusText}>{Number(resumo.usuarios || 0)}</strong>
            </div>
            <div>
              <span style={s.label}>ATINGIRAM TETO</span>
              <strong style={s.statusText}>{Number(resumo.atingiram_teto || 0)}</strong>
            </div>
          </div>

          <div style={s.cards}>
            <Metric label="Crédito no mês" value={money(resumo.saldo)} hint={`Gerado: ${money(resumo.bruto)}`} />
            <Metric label="Rateio WMS" value={money(resumo.valor_wms)} hint="Origem Rateio WMS" />
            <Metric label="Tarefas WMS" value={money(resumo.tarefas_wms)} hint="Monitorar Tarefas" />
            <Metric label="Escalonada" value={money(resumo.escalonada)} hint="Incentivo adicional" />
            <Metric label="Atividades" value={money(resumo.atividades)} hint="Atividades aprovadas" />
            <Metric label="Bloqueado por teto" value={money(resumo.bloqueado_teto)} hint="Acima dos limites individuais" />
          </div>

          <div style={s.grid2}>
            <Panel title="Por turno">
              <BarList rows={dashboard?.por_turno || []} />
            </Panel>
            <Panel title="Por cargo">
              <BarList rows={dashboard?.por_cargo || []} />
            </Panel>
          </div>

          <Panel title="Crédito por dia">
            <div style={s.dailyGrid}>
              {(dashboard?.por_dia || []).map((row) => (
                <div style={s.dailyItem} key={row.data}>
                  <span>{String(row.data).slice(8, 10)}</span>
                  <strong>{money(row.valor)}</strong>
                </div>
              ))}
              {!dashboard?.por_dia?.length && <Empty text="Sem valores neste mês." />}
            </div>
          </Panel>

          <Panel title="Colaboradores">
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Colaborador</th>
                    <th style={s.th}>Turno</th>
                    <th style={s.th}>Cargo</th>
                    <th style={s.th}>Rateio</th>
                    <th style={s.th}>Tarefas</th>
                    <th style={s.th}>Escalonada</th>
                    <th style={s.th}>Atividades</th>
                    <th style={s.th}>Crédito</th>
                    <th style={s.th}>Teto</th>
                  </tr>
                </thead>
                <tbody>
                  {topUsers.map((row) => (
                    <tr key={row.id}>
                      <td style={s.td}><strong>{row.nome}</strong></td>
                      <td style={s.td}>{row.turno || '-'}</td>
                      <td style={s.td}>{row.cargo || '-'}</td>
                      <td style={s.td}>{money(row.valor_wms)}</td>
                      <td style={s.td}>{money(row.tarefas_wms)}</td>
                      <td style={s.td}>{money(row.escalonada)}</td>
                      <td style={s.td}>{money(row.atividades)}</td>
                      <td style={s.td}><strong>{money(row.saldo)}</strong></td>
                      <td style={s.td}>{row.teto == null ? 'Sem teto' : row.atingiu_teto ? 'Atingido' : money(row.teto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {tab === 'integracoes' && (
        <>
          <Panel title="Reprocessar um dia">
            <form style={s.reprocessForm} onSubmit={handleReprocess}>
              <label style={s.field}>
                <span>Data</span>
                <input
                  style={s.input}
                  type="date"
                  value={reprocessDate}
                  max={today()}
                  onChange={(event) => setReprocessDate(event.target.value)}
                />
              </label>
              <label style={s.field}>
                <span>Origem</span>
                <select
                  style={s.input}
                  value={reprocessOrigin}
                  onChange={(event) => setReprocessOrigin(event.target.value)}
                >
                  <option value="ambos">Rateio + Tarefas</option>
                  <option value="rateio">Somente Rateio</option>
                  <option value="tarefas">Somente Monitorar Tarefas</option>
                </select>
              </label>
              <button style={s.primaryButton} type="submit" disabled={busy === 'reprocessar'}>
                {busy === 'reprocessar' ? 'Reprocessando...' : 'Reprocessar sem duplicar'}
              </button>
            </form>
            <p style={s.help}>
              A data é consultada novamente no WMS e os registros daquele dia são atualizados de forma idempotente.
              Meses fechados precisam ser reabertos antes do reprocessamento.
            </p>
          </Panel>

          <Panel title="Alertas automáticos">
            <div style={s.alertList}>
              {alerts.map((alert) => (
                <article
                  key={alert.id}
                  style={{
                    ...s.alert,
                    ...(alert.severity === 'error'
                      ? s.alertError
                      : alert.severity === 'warning'
                        ? s.alertWarning
                        : s.alertSuccess),
                  }}
                >
                  <div>
                    <strong>{alert.title}</strong>
                    <p>{alert.message}</p>
                    {alert.detalhes?.length > 0 && (
                      <small>{alert.detalhes.join(' • ')}</small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        </>
      )}

      {tab === 'fechamento' && (
        <>
          <Panel title={`Fechamento de ${month}`}>
            <div style={s.closureActions}>
              <div>
                <span style={s.label}>STATUS ATUAL</span>
                <strong style={s.statusText}>{statusLabel(currentClosure.status)}</strong>
              </div>
              <div style={s.actionButtons}>
                <button
                  style={s.secondaryButton}
                  type="button"
                  disabled={busy || currentClosure.status === 'fechado'}
                  onClick={() => runAction('conferir_mes', { mes: month })}
                >
                  {busy === 'conferir_mes' ? 'Salvando...' : 'Marcar conferido'}
                </button>
                <button
                  style={s.primaryButton}
                  type="button"
                  disabled={busy || currentClosure.status === 'fechado'}
                  onClick={() => runAction('fechar_mes', { mes: month })}
                >
                  {busy === 'fechar_mes' ? 'Fechando...' : 'Fechar e congelar mês'}
                </button>
                {currentClosure.status === 'fechado' && (
                  <button
                    style={s.dangerButton}
                    type="button"
                    disabled={busy}
                    onClick={() => runAction('reabrir_mes', { mes: month })}
                  >
                    {busy === 'reabrir_mes' ? 'Reabrindo...' : 'Reabrir mês'}
                  </button>
                )}
              </div>
            </div>
            <p style={s.help}>
              Ao fechar, o sistema salva um snapshot da carteira de todos os usuários.
              Depois disso, a carteira daquele mês não muda mesmo que configurações futuras sejam alteradas.
            </p>
          </Panel>

          <Panel title="Histórico de fechamentos">
            <div style={s.closureList}>
              {closures.map((row) => (
                <article style={s.closureItem} key={row.mes}>
                  <div>
                    <strong>{row.mes}</strong>
                    <span>{statusLabel(row.status)}</span>
                  </div>
                  <small>
                    {row.status === 'fechado'
                      ? `Fechado por ${row.fechado_por_nome || '-'} em ${dateTime(row.fechado_em)}`
                      : row.status === 'conferido'
                        ? `Conferido por ${row.conferido_por_nome || '-'} em ${dateTime(row.conferido_em)}`
                        : row.reaberto_em
                          ? `Reaberto por ${row.reaberto_por_nome || '-'} em ${dateTime(row.reaberto_em)}`
                          : 'Sem fechamento registrado'}
                  </small>
                </article>
              ))}
              {!closures.length && <Empty text="Nenhum mês foi marcado ainda." />}
            </div>
          </Panel>
        </>
      )}

      {tab === 'auditoria' && (
        <Panel title="Histórico administrativo">
          <div style={s.auditList}>
            {audit.map((row) => (
              <article style={s.auditItem} key={row.id}>
                <div style={s.auditHead}>
                  <strong>{row.usuario_nome}</strong>
                  <span>{dateTime(row.criado_em)}</span>
                </div>
                <p>{row.descricao || `${row.acao} em ${row.entidade}`}</p>
                <small>{row.entidade}{row.entidade_id ? ` • ${row.entidade_id}` : ''} • {row.acao}</small>
              </article>
            ))}
            {!audit.length && <Empty text="Nenhuma ação auditada até o momento." />}
          </div>
        </Panel>
      )}
    </section>
  )
}

function Metric({ label, value, hint }) {
  return (
    <article style={s.metric}>
      <span style={s.label}>{label}</span>
      <strong style={s.metricValue}>{value}</strong>
      <small style={s.metricHint}>{hint}</small>
    </article>
  )
}

function Panel({ title, children }) {
  return (
    <section style={s.panel}>
      <div style={s.panelHead}>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function BarList({ rows }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.valor || 0)))
  return (
    <div style={s.barList}>
      {rows.map((row) => (
        <div style={s.barItem} key={row.nome}>
          <div style={s.barLabel}>
            <strong>{row.nome}</strong>
            <span>{money(row.valor)}</span>
          </div>
          <div style={s.barTrack}>
            <i style={{ ...s.barFill, width: `${Math.max(3, (Number(row.valor || 0) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
      {!rows.length && <Empty text="Sem dados no período." />}
    </div>
  )
}

function Empty({ text }) {
  return <div style={s.empty}>{text}</div>
}

const s = {
  page: { display: 'grid', gap: 16 },
  hero: { display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 16 },
  title: { margin: '6px 0', color: '#101828', fontSize: '34px' },
  subtitle: { margin: 0, color: '#667085', lineHeight: 1.5 },
  monthField: { display: 'grid', gap: 5, minWidth: 180, color: '#344054', fontSize: 11, fontWeight: 800 },
  input: { minHeight: 42, border: '1px solid #d0d5dd', borderRadius: 11, padding: '0 11px', background: '#fff', font: 'inherit' },
  tabs: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  tab: { border: '1px solid #d0d5dd', borderRadius: 999, padding: '9px 14px', background: '#fff', color: '#475467', fontWeight: 800, cursor: 'pointer' },
  tabActive: { background: '#101828', color: '#fff', borderColor: '#101828' },
  statusRow: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 },
  label: { color: '#667085', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em' },
  statusText: { display: 'block', marginTop: 5, color: '#101828', fontSize: 20 },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 },
  metric: { padding: 16, border: '1px solid #e4e7ec', borderRadius: 16, background: '#fff', display: 'grid', gap: 5 },
  metricValue: { color: '#101828', fontSize: 22 },
  metricHint: { color: '#98a2b3', fontSize: 10 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 },
  panel: { border: '1px solid #e4e7ec', borderRadius: 18, background: '#fff', overflow: 'hidden' },
  panelHead: { padding: '15px 17px', borderBottom: '1px solid #eaecf0' },
  barList: { padding: 16, display: 'grid', gap: 12 },
  barItem: { display: 'grid', gap: 6 },
  barLabel: { display: 'flex', justifyContent: 'space-between', gap: 12, color: '#344054', fontSize: 11 },
  barTrack: { height: 8, borderRadius: 999, background: '#f2f4f7', overflow: 'hidden' },
  barFill: { display: 'block', height: '100%', borderRadius: 999, background: '#155eef' },
  dailyGrid: { padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8 },
  dailyItem: { padding: 10, borderRadius: 12, background: '#f8fafc', display: 'grid', gap: 4 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: { padding: '10px 12px', textAlign: 'left', color: '#667085', background: '#f9fafb', borderBottom: '1px solid #eaecf0' },
  td: { padding: '10px 12px', color: '#344054', borderBottom: '1px solid #f2f4f7', whiteSpace: 'nowrap' },
  reprocessForm: { padding: 16, display: 'grid', gridTemplateColumns: 'minmax(180px, .7fr) minmax(220px, 1fr) auto', gap: 10, alignItems: 'end' },
  field: { display: 'grid', gap: 5, color: '#344054', fontSize: 11, fontWeight: 800 },
  primaryButton: { minHeight: 42, border: 0, borderRadius: 11, padding: '0 14px', background: '#155eef', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  secondaryButton: { minHeight: 42, border: '1px solid #d0d5dd', borderRadius: 11, padding: '0 14px', background: '#fff', color: '#344054', fontWeight: 900, cursor: 'pointer' },
  dangerButton: { minHeight: 42, border: '1px solid #fecdca', borderRadius: 11, padding: '0 14px', background: '#fff1f0', color: '#b42318', fontWeight: 900, cursor: 'pointer' },
  help: { margin: '0 16px 16px', color: '#667085', fontSize: 10, lineHeight: 1.5 },
  alertList: { padding: 16, display: 'grid', gap: 10 },
  alert: { padding: 14, borderRadius: 13, border: '1px solid #eaecf0' },
  alertError: { background: '#fef3f2', borderColor: '#fecdca', color: '#b42318' },
  alertWarning: { background: '#fffaeb', borderColor: '#fedf89', color: '#b54708' },
  alertSuccess: { background: '#ecfdf3', borderColor: '#abefc6', color: '#027a48' },
  closureActions: { padding: 16, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' },
  actionButtons: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  closureList: { display: 'grid' },
  closureItem: { padding: '13px 16px', borderBottom: '1px solid #f2f4f7', display: 'grid', gap: 5 },
  auditList: { display: 'grid' },
  auditItem: { padding: '13px 16px', borderBottom: '1px solid #f2f4f7' },
  auditHead: { display: 'flex', justifyContent: 'space-between', gap: 12 },
  empty: { padding: 18, color: '#667085', textAlign: 'center' },
}
