import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import './WalletScreen.css'

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function WalletCapsScreen() {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/api/wallet/caps')
      const rows = data.usuarios || []
      setUsers(rows)
      setValues(Object.fromEntries(rows.map((u) => [u.id, u.valor_teto == null ? '' : String(u.valor_teto).replace('.', ',')])))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => [u.nome, u.turno].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
  }, [users, search])
  async function save(user, semTeto = false) {
    const amount = Number(String(values[user.id] || '').replace(',', '.'))
    if (!semTeto && (!Number.isFinite(amount) || amount < 0)) {
      setError('Informe um teto válido.')
      return
    }

    setSavingId(user.id)
    setError('')
    setMessage('')
    try {
      const data = await api.post('/api/wallet/caps', {
        usuario_id: user.id,
        valor_teto: semTeto ? null : amount,
        sem_teto: semTeto,
      })
      setMessage(`${user.nome}: ${data.message}`)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingId(0)
    }
  }

  return (
    <section className="wallet-page">
      <div className="wallet-hero">
        <div>
          <span className="dashboard-kicker">CONFIGURAÇÃO • ADM</span>
          <h1>Tetos da carteira</h1>
          <p>Defina o limite mensal de cada ajudante. Quem não tiver teto fica sem limite.</p>
        </div>
      </div>

      {error && <div className="activity-message error">{error}</div>}
      {message && <div className="activity-message success">{message}</div>}

      <div className="wallet-cap-toolbar">
        <input type="search" placeholder="Buscar ajudante por nome ou turno..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <span>{filtered.length} ajudante(s)</span>
      </div>
      {loading ? (
        <div className="activities-loading">Carregando tetos...</div>
      ) : (
        <div className="wallet-cap-list">
          {filtered.map((user) => (
            <article key={user.id}>
              <div className="wallet-cap-user">
                <span className="activity-person-avatar">{String(user.nome || 'U').charAt(0).toUpperCase()}</span>
                <div>
                  <strong>{user.nome}</strong>
                  <small>Turno {user.turno || 'não informado'}</small>
                </div>
              </div>

              <div className="wallet-cap-current">
                <span>Teto atual</span>
                <strong>{user.valor_teto == null ? 'Sem teto' : money(user.valor_teto)}</strong>
              </div>

              <div className="wallet-cap-edit">
                <div className="wallet-cap-input">
                  <span>R$</span>
                  <input
                    inputMode="decimal"
                    value={values[user.id] ?? ''}
                    placeholder="Ex.: 400,00"
                    onChange={(e) => setValues((current) => ({ ...current, [user.id]: e.target.value.replace(/[^0-9,.]/g, '') }))}
                  />
                </div>
                <button type="button" onClick={() => save(user)} disabled={savingId === user.id}>
                  {savingId === user.id ? 'Salvando...' : 'Salvar teto'}
                </button>
                <button className="secondary" type="button" onClick={() => save(user, true)} disabled={savingId === user.id}>
                  Sem teto
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
