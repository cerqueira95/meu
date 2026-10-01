import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

function localIsoDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function number(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0))
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function dateLabel(value) {
  const text = String(value || '').slice(0, 10)
  const [year, month, day] = text.split('-')
  return year && month && day ? `${day}/${month}/${year}` : text
}

export default function OperatorTasksScreen() {
  const today = useMemo(() => localIsoDate(), [])
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [data, setData] = useState({ resumo: {}, agrupado: [], tarefas: [] })
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadReport(today, today)
  }, [today])

  async function loadReport(start = from, end = to) {
    setLoading(true)
    setError('')
    try {
      const result = await api.get(`/api/operator-tasks?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`)
      setData(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function applyPeriod(event) {
    event?.preventDefault()
    if (!from || !to) {
      setError('Selecione a data inicial e final.')
      return
    }
    if (from > to) {
      setError('A data inicial não pode ser maior que a final.')
      return
    }
    await loadReport()
  }

  async function runSelectedDate() {
    if (!from || from !== to) {
      setError('Para puxar as tarefas, selecione a mesma data no início e no final.')
      return
    }

    setRunning(true)
    setError('')
    setMessage('')

    try {
      const result = await api.post('/api/operator-tasks', { data: from })
      setMessage(result.message)
      await loadReport(from, to)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setRunning(false)
    }
  }

  const rows = (data.agrupado || []).filter((row) => {
    const text = query.trim().toLocaleLowerCase('pt-BR')
    if (!text) return true
    return String(row.usuario_nome || '').toLocaleLowerCase('pt-BR').includes(text) ||
      String(row.tipo_nome || '').toLocaleLowerCase('pt-BR').includes(text)
  })

  return (
    <section className="operator-tasks-page" style={styles.page}>
      <div className="operator-tasks-hero" style={styles.hero}>
        <div>
          <span className="dashboard-kicker">WMS • OPERADORES</span>
          <h1 style={styles.title}>Tarefas dos operadores</h1>
          <p style={styles.subtitle}>
            Consulte tarefas concluídas do Monitorar Tarefas. A atualização manual usa o ID da tarefa e nunca duplica registros.
          </p>
        </div>
      </div>

      <form className="operator-tasks-filter" style={styles.filter} onSubmit={applyPeriod}>
        <label className="operator-tasks-field" style={styles.field}>
          <span>Data inicial</span>
          <input style={styles.input} type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="operator-tasks-field" style={styles.field}>
          <span>Data final</span>
          <input style={styles.input} type="date" value={to} max={today} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button style={styles.primary} type="submit" disabled={loading || running}>
          {loading ? 'Carregando...' : 'Aplicar período'}
        </button>
        <button style={styles.manual} type="button" onClick={runSelectedDate} disabled={loading || running}>
          {running ? 'Puxando WMS...' : 'Puxar tarefas da data'}
        </button>
      </form>

      {error && <div className="activity-message error">{error}</div>}
      {message && <div className="activity-message success">{message}</div>}

      <div className="operator-tasks-cards" style={styles.cards}>
        <article style={styles.card}>
          <span>TAREFAS</span>
          <strong>{number(data.resumo?.tarefas)}</strong>
          <small>tarefas concluídas vinculadas</small>
        </article>
        <article style={styles.card}>
          <span>OPERADORES</span>
          <strong>{number(data.resumo?.operadores)}</strong>
          <small>operadores com produção</small>
        </article>
        <article style={styles.card}>
          <span>TIPOS</span>
          <strong>{number(data.resumo?.tipos)}</strong>
          <small>tipos diferentes de tarefa</small>
        </article>
        <article style={styles.card}>
          <span>VALOR CALCULADO</span>
          <strong>{money(data.resumo?.valor)}</strong>
          <small>valor que entra na carteira dos operadores</small>
        </article>
      </div>

      <section className="operator-tasks-panel" style={styles.panel}>
        <div className="operator-tasks-panel-head" style={styles.panelHead}>
          <div>
            <span className="dashboard-kicker">RESUMO</span>
            <h2 style={styles.panelTitle}>Produção por operador</h2>
          </div>
          <input
            className="operator-tasks-search"
            style={styles.search}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar operador ou tipo"
          />
        </div>

        {loading ? (
          <div style={styles.empty}>Carregando tarefas...</div>
        ) : rows.length === 0 ? (
          <div style={styles.empty}>Nenhuma tarefa de operador encontrada no período.</div>
        ) : (
          <div className="operator-tasks-table-wrap" style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Operador</th>
                  <th style={styles.th}>Tipo da tarefa</th>
                  <th style={styles.th}>Quantidade</th>
                  <th style={styles.th}>Valor unitário</th>
                  <th style={styles.th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.usuario_id}-${row.tipo_nome}`}>
                    <td style={styles.td}><strong>{row.usuario_nome}</strong></td>
                    <td style={styles.td}>{row.tipo_nome}</td>
                    <td style={styles.td}><strong>{number(row.quantidade)}</strong></td>
                    <td style={styles.td}>{money(row.valor_unitario)}</td>
                    <td style={styles.td}><strong>{money(row.valor)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="operator-tasks-panel" style={styles.panel}>
        <div className="operator-tasks-panel-head" style={styles.panelHead}>
          <div>
            <span className="dashboard-kicker">DETALHAMENTO</span>
            <h2 style={styles.panelTitle}>Tarefas importadas</h2>
          </div>
          <span style={styles.pill}>{number(data.tarefas?.length)} registros</span>
        </div>

        {!data.tarefas?.length ? (
          <div style={styles.empty}>Sem tarefas detalhadas no período.</div>
        ) : (
          <div className="operator-tasks-table-wrap" style={styles.tableWrap}>
            <table style={{ ...styles.table, minWidth: 1050 }}>
              <thead>
                <tr>
                  <th style={styles.th}>Data</th>
                  <th style={styles.th}>Operador</th>
                  <th style={styles.th}>Tipo</th>
                  <th style={styles.th}>Documento</th>
                  <th style={styles.th}>Origem</th>
                  <th style={styles.th}>Destino</th>
                  <th style={styles.th}>Palete</th>
                  <th style={styles.th}>Valor</th>
                  <th style={styles.th}>ID WMS</th>
                </tr>
              </thead>
              <tbody>
                {data.tarefas.map((task) => (
                  <tr key={task.wms_task_id}>
                    <td style={styles.td}>{dateLabel(task.data_ref)}</td>
                    <td style={styles.td}><strong>{task.usuario_nome}</strong></td>
                    <td style={styles.td}>{task.tipo_nome}</td>
                    <td style={styles.td}>{task.documento || '-'}</td>
                    <td style={styles.td}>{task.origem || '-'}</td>
                    <td style={styles.td}>{task.destino || '-'}</td>
                    <td style={styles.td}>{task.palete || '-'}</td>
                    <td style={styles.td}><strong>{money(task.valor_unitario)}</strong></td>
                    <td style={styles.td}>{task.wms_task_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

const styles = {
  page: { display: 'grid', gap: 18 },
  hero: { display: 'flex', justifyContent: 'space-between', gap: 18 },
  title: { margin: '6px 0', color: '#102a4d', fontSize: 'clamp(30px, 4vw, 44px)' },
  subtitle: { margin: 0, color: '#718096', lineHeight: 1.6 },
  filter: { display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 10, padding: 16, border: '1px solid #dfe6ee', borderRadius: 17, background: '#fff' },
  field: { display: 'grid', gap: 6, color: '#667085', fontSize: 11, fontWeight: 800 },
  input: { minHeight: 42, border: '1px solid #d7e0ea', borderRadius: 10, padding: '0 11px', background: '#fff' },
  primary: { minHeight: 42, border: 0, borderRadius: 10, padding: '0 16px', background: '#ffb000', color: '#172235', fontWeight: 900 },
  manual: { minHeight: 42, border: '1px solid #155eef', borderRadius: 10, padding: '0 16px', background: '#eef4ff', color: '#1849a9', fontWeight: 900 },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  card: { display: 'grid', gap: 6, padding: 17, border: '1px solid #dfe6ee', borderRadius: 17, background: '#fff' },
  panel: { border: '1px solid #dfe6ee', borderRadius: 18, background: '#fff', overflow: 'hidden' },
  panelHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 16, borderBottom: '1px solid #edf1f5' },
  panelTitle: { margin: 0, color: '#172b46', fontSize: 19 },
  search: { width: 260, maxWidth: '50vw', minHeight: 38, border: '1px solid #d7e0ea', borderRadius: 10, padding: '0 11px' },
  pill: { padding: '6px 9px', borderRadius: 999, background: '#f3f6f9', color: '#667085', fontSize: 10, fontWeight: 800 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '11px 13px', textAlign: 'left', background: '#f8fafc', color: '#8b97a9', fontSize: 9, whiteSpace: 'nowrap' },
  td: { padding: '11px 13px', borderTop: '1px solid #edf1f5', color: '#344054', fontSize: 11, whiteSpace: 'nowrap' },
  empty: { padding: 32, color: '#7f8b9d', textAlign: 'center' },
}
