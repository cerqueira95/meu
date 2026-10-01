import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import './OperatorTasksScreen.css'

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

export default function OperatorTasksScreen() {
  const today = useMemo(() => localIsoDate(), [])
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [data, setData] = useState({ resumo: {}, agrupado: [] })
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
      const result = await api.get(
        `/api/operator-tasks?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`,
      )
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

    return (
      String(row.usuario_nome || '').toLocaleLowerCase('pt-BR').includes(text) ||
      String(row.tipo_nome || '').toLocaleLowerCase('pt-BR').includes(text)
    )
  })

  return (
    <section className="operator-tasks-page">
      <div className="operator-tasks-hero">
        <div>
          <span className="dashboard-kicker">WMS • OPERADORES</span>
          <h1>Tarefas dos operadores</h1>
          <p>
            Consulte a produção dos operadores por atividade. A atualização manual usa
            o ID da tarefa no banco para evitar duplicidade, enquanto a tela mostra
            somente quantidade e valor por atividade.
          </p>
        </div>
      </div>

      <form className="operator-tasks-filter" onSubmit={applyPeriod}>
        <label className="operator-tasks-field">
          <span>Data inicial</span>
          <input
            type="date"
            value={from}
            max={today}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>

        <label className="operator-tasks-field">
          <span>Data final</span>
          <input
            type="date"
            value={to}
            max={today}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>

        <button type="submit" disabled={loading || running}>
          {loading ? 'Carregando...' : 'Aplicar período'}
        </button>

        <button type="button" onClick={runSelectedDate} disabled={loading || running}>
          {running ? 'Puxando WMS...' : 'Puxar tarefas da data'}
        </button>
      </form>

      {error && <div className="activity-message error">{error}</div>}
      {message && <div className="activity-message success">{message}</div>}

      <div className="operator-tasks-cards">
        <article>
          <span>TAREFAS</span>
          <strong>{number(data.resumo?.tarefas)}</strong>
          <small>tarefas concluídas vinculadas</small>
        </article>

        <article>
          <span>OPERADORES</span>
          <strong>{number(data.resumo?.operadores)}</strong>
          <small>operadores com produção</small>
        </article>

        <article>
          <span>TIPOS</span>
          <strong>{number(data.resumo?.tipos)}</strong>
          <small>tipos diferentes de tarefa</small>
        </article>

        <article>
          <span>VALOR CALCULADO</span>
          <strong>{money(data.resumo?.valor)}</strong>
          <small>valor que entra na carteira dos operadores</small>
        </article>
      </div>

      <section className="operator-tasks-panel">
        <div className="operator-tasks-panel-head">
          <div>
            <span className="dashboard-kicker">RESUMO</span>
            <h2>Produção por operador</h2>
          </div>

          <input
            className="operator-tasks-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar operador ou atividade"
          />
        </div>

        {loading ? (
          <div className="operator-tasks-empty">Carregando tarefas...</div>
        ) : rows.length === 0 ? (
          <div className="operator-tasks-empty">
            Nenhuma tarefa de operador encontrada no período.
          </div>
        ) : (
          <div className="operator-tasks-table-wrap">
            <table className="operator-tasks-table">
              <thead>
                <tr>
                  <th>Operador</th>
                  <th>Atividade</th>
                  <th>Quantidade</th>
                  <th>Valor unitário</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.usuario_id}-${row.tipo_nome}`}>
                    <td><strong>{row.usuario_nome}</strong></td>
                    <td>{row.tipo_nome}</td>
                    <td><strong>{number(row.quantidade)}</strong></td>
                    <td>{money(row.valor_unitario)}</td>
                    <td><strong>{money(row.valor)}</strong></td>
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
