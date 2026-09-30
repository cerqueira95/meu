import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import './WalletScreen.css'

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(String(value).slice(0, 10) + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function entryIcon(item) {
  if (item.tipo === 'wms') return 'W'
  if (item.tipo === 'wms_tarefa') return 'T'
  if (item.tipo === 'escalonada') return 'E'
  return 'A'
}

export default function WalletScreen() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState('')
  const [details, setDetails] = useState({})
  const [detailsLoading, setDetailsLoading] = useState('')

  useEffect(() => {
    setExpandedId('')
    setDetails({})
    load(month)
  }, [month])

  async function load(targetMonth) {
    setLoading(true)
    setError('')
    try {
      setData(await api.get(`/api/wallet?mes=${encodeURIComponent(targetMonth)}`))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleTaskDetails(item) {
    if (item.tipo !== 'wms_tarefa') return

    if (expandedId === item.id) {
      setExpandedId('')
      return
    }

    setExpandedId(item.id)

    if (details[item.id]) return

    setDetailsLoading(item.id)
    setError('')

    try {
      const result = await api.get(
        `/api/wallet/task-details?data=${encodeURIComponent(String(item.data).slice(0, 10))}&chave=${encodeURIComponent(item.tarefa_chave)}`,
      )
      setDetails((current) => ({ ...current, [item.id]: result }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDetailsLoading('')
    }
  }

  const progress = useMemo(() => {
    if (!data?.teto?.possui || !data?.teto?.valor) return 0
    return Math.min(100, (Number(data.totais?.saldo || 0) / Number(data.teto.valor)) * 100)
  }, [data])

  return (
    <section className="wallet-page">
      <div className="wallet-hero">
        <div>
          <span className="dashboard-kicker">REMUNERAÇÃO VARIÁVEL</span>
          <h1>Minha carteira</h1>
          <p>Acompanhe o Valor WMS, tarefas WMS, escalonada, atividades e seu limite mensal.</p>
        </div>
        <label className="wallet-month">
          <span>Mês</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>

      {data?.fechamento?.status === 'fechado' && (
        <div className="wallet-closed-note">
          <strong>Mês fechado</strong>
          <span>
            Os valores deste período estão congelados no fechamento
            {data.fechamento.fechado_por_nome ? ` realizado por ${data.fechamento.fechado_por_nome}` : ''}.
          </span>
        </div>
      )}

      {error && <div className="activity-message error">{error}</div>}

      {loading ? (
        <div className="activities-loading">Carregando carteira...</div>
      ) : data ? (
        <>
          <div className="wallet-balance-card">
            <div>
              <span>Saldo da carteira</span>
              <strong>{money(data.totais?.saldo)}</strong>
              <small>{data.teto?.possui ? `Teto: ${money(data.teto.valor)}` : 'Sem teto cadastrado'}</small>
            </div>
            <div className="wallet-limit">
              <span>{data.teto?.possui ? `${progress.toFixed(0)}% do teto` : 'Sem limite'}</span>
              <div><i style={{ width: data.teto?.possui ? `${progress}%` : '0%' }} /></div>
              {data.teto?.possui && <small>Disponível: {money(data.teto.restante)}</small>}
            </div>
          </div>

          <div className="wallet-summary-grid">
            <article>
              <span>Valor WMS</span>
              <strong>{money(data.totais?.valor_wms)}</strong>
              <small>Valor vindo do Rateio WMS</small>
            </article>
            <article>
              <span>Tarefas WMS</span>
              <strong>{money(data.totais?.tarefas_wms)}</strong>
              <small>Tarefas concluídas do Monitorar Tarefas</small>
            </article>
            <article>
              <span>Escalonada</span>
              <strong>{money(data.totais?.escalonada)}</strong>
              <small>Somente o incentivo adicional</small>
            </article>
            <article>
              <span>Atividades</span>
              <strong>{money(data.totais?.atividades)}</strong>
              <small>Atividades aprovadas pelo ADM</small>
            </article>
            <article>
              <span>Gerado no mês</span>
              <strong>{money(data.totais?.bruto)}</strong>
              <small>{data.totais?.bloqueado_teto > 0 ? `${money(data.totais.bloqueado_teto)} acima do teto` : 'Sem corte pelo teto'}</small>
            </article>
          </div>

          <section className="wallet-extract">
            <div className="wallet-extract-head">
              <div><span className="dashboard-kicker">EXTRATO</span><h2>De onde veio seu valor</h2></div>
              <span>{data.extrato?.length || 0} lançamento(s)</span>
            </div>

            <div className="wallet-extract-list">
              {(data.extrato || []).map((item) => {
                const detail = details[item.id]
                const expanded = expandedId === item.id
                return (
                  <div className="wallet-entry-block" key={item.id}>
                    <article className={item.tipo === 'wms_tarefa' ? 'wallet-entry-clickable' : ''}>
                      <div className={`wallet-entry-icon ${item.tipo}`}>
                        {entryIcon(item)}
                      </div>
                      <div className="wallet-entry-copy">
                        <strong>{item.titulo}</strong>
                        <span>{item.detalhe}</span>
                        <small>{formatDate(item.data)}</small>
                        {item.tipo === 'wms_tarefa' && (
                          <button
                            className="wallet-detail-button"
                            type="button"
                            onClick={() => toggleTaskDetails(item)}
                          >
                            {expanded ? 'Ocultar detalhes' : 'Ver detalhes das tarefas'}
                          </button>
                        )}
                      </div>
                      <div className="wallet-entry-value">
                        <strong>+ {money(item.valor_creditado)}</strong>
                        {item.valor_bloqueado_teto > 0 && (
                          <small>{money(item.valor_bloqueado_teto)} não creditado por teto</small>
                        )}
                      </div>
                    </article>

                    {item.tipo === 'wms_tarefa' && expanded && (
                      <div className="wallet-task-details">
                        {detailsLoading === item.id ? (
                          <span>Carregando detalhes...</span>
                        ) : detail ? (
                          <>
                            <div className="wallet-task-summary">
                              <span><strong>{detail.quantidade}</strong> tarefa(s)</span>
                              <span><strong>{money(detail.valor_unitario)}</strong> por tarefa</span>
                              <span><strong>{money(detail.total)}</strong> total</span>
                            </div>
                            <div className="wallet-task-table-wrap">
                              <table className="wallet-task-table">
                                <thead>
                                  <tr>
                                    <th>ID</th>
                                    <th>Documento</th>
                                    <th>Origem</th>
                                    <th>Destino</th>
                                    <th>Palete</th>
                                    <th>Valor</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(detail.tarefas || []).map((task) => (
                                    <tr key={task.id}>
                                      <td>{task.id}</td>
                                      <td>{task.documento || '-'}</td>
                                      <td>{task.origem || '-'}</td>
                                      <td>{task.destino || '-'}</td>
                                      <td>{task.palete || '-'}</td>
                                      <td>{money(task.valor)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        ) : (
                          <span>Não foi possível carregar os detalhes.</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {!data.extrato?.length && <div className="wallet-empty">Nenhum valor encontrado neste mês.</div>}
            </div>
          </section>
        </>
      ) : null}
    </section>
  )
}
