import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import './ActivitiesScreen.css'

function currency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function normalizeInput(value) {
  return String(value ?? '').replace(',', '.').replace(/[^0-9.]/g, '')
}

export default function ActivityValuesScreen() {
  const [items, setItems] = useState([])
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')

    try {
      const data = await api.get('/api/activities/settings')
      const activities = data.atividades || []
      setItems(activities)
      setValues(
        Object.fromEntries(
          activities.map((item) => [item.chave, String(Number(item.valor_unitario || 0).toFixed(2)).replace('.', ',')]),
        ),
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function save(item) {
    const raw = String(values[item.chave] || '').replace(',', '.')
    const amount = Number(raw)

    if (!Number.isFinite(amount) || amount < 0) {
      setError('Informe um valor válido.')
      return
    }

    setSavingKey(item.chave)
    setError('')
    setMessage('')

    try {
      const data = await api.post('/api/activities/settings', {
        chave: item.chave,
        valor_unitario: amount,
      })

      setMessage(`${item.nome}: ${data.message}`)
      setItems((current) =>
        current.map((row) =>
          row.chave === item.chave
            ? { ...row, valor_unitario: data.atividade.valor_unitario, atualizado_em: data.atividade.atualizado_em }
            : row,
        ),
      )
      setValues((current) => ({
        ...current,
        [item.chave]: String(Number(data.atividade.valor_unitario || 0).toFixed(2)).replace('.', ','),
      }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingKey('')
    }
  }

  return (
    <section className="activities-page">
      <div className="activities-hero">
        <div>
          <span className="dashboard-kicker">CONFIGURAÇÃO • ATIVIDADES</span>
          <h1>Valores das atividades</h1>
          <p>
            Altere os valores sem precisar editar o código. O novo valor passa a valer
            para os próximos lançamentos; registros antigos mantêm o valor histórico.
          </p>
        </div>
      </div>

      {error && <div className="activity-message error">{error}</div>}
      {message && <div className="activity-message success">{message}</div>}

      {loading ? (
        <div className="activities-loading">Carregando valores...</div>
      ) : (
        <div className="activity-values-grid">
          {items.map((item) => (
            <article className="activity-value-card" key={item.chave}>
              <div className="activity-value-card-head">
                <div>
                  <span className="activity-value-tag">{item.ativo ? 'Ativa' : 'Inativa'}</span>
                  <h2>{item.nome}</h2>
                </div>
                <span className="activity-value-current">{currency(item.valor_unitario)}</span>
              </div>

              <div className="activity-value-edit">
                <label htmlFor={`value-${item.chave}`}>Novo valor unitário</label>
                <div className="activity-value-input-wrap">
                  <span>R$</span>
                  <input
                    id={`value-${item.chave}`}
                    inputMode="decimal"
                    value={values[item.chave] ?? ''}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [item.chave]: normalizeInput(event.target.value).replace('.', ','),
                      }))
                    }
                    placeholder="0,00"
                  />
                </div>
              </div>

              <button
                className="activity-value-save"
                type="button"
                onClick={() => save(item)}
                disabled={savingKey === item.chave}
              >
                {savingKey === item.chave ? 'Salvando...' : 'Salvar valor'}
              </button>
            </article>
          ))}
        </div>
      )}

      <div className="activity-values-note">
        <strong>Importante:</strong>
        <span>
          alterar um valor não muda lançamentos que já foram feitos. Cada lançamento
          guarda o valor vigente no momento em que foi criado.
        </span>
      </div>
    </section>
  )
}
