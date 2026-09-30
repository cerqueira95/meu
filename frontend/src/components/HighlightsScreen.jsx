import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import UserAvatar from './UserAvatar.jsx'
import './HighlightsScreen.css'

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(String(value).slice(0, 10) + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

function periodLabel(item) {
  if (item.periodo_tipo === 'dia') return `Destaque do dia • ${formatDate(item.data_inicio)}`
  if (item.periodo_tipo === 'semana') {
    return `Destaque da semana • ${formatDate(item.data_inicio)} a ${formatDate(item.data_fim)}`
  }
  const date = new Date(String(item.data_inicio).slice(0, 10) + 'T12:00:00')
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date)
  return `Destaque do mês • ${label}`
}

export default function HighlightsScreen({ adminMode = false }) {
  const [data, setData] = useState(null)
  const [funcao, setFuncao] = useState('Operador')
  const [periodo, setPeriodo] = useState('dia')
  const [dataBase, setDataBase] = useState(today())
  const [usuarioId, setUsuarioId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await api.get('/api/highlights'))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const candidatos = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.candidatos || [])
      .filter((user) => user.funcao_destaque === funcao)
      .filter((user) =>
        !q ||
        [user.nome, user.cargo, user.turno]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q)),
      )
  }, [data, funcao, search])

  const selectedUser = (data?.candidatos || [])
    .find((user) => String(user.id) === String(usuarioId))

  async function save(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!usuarioId) return setError('Selecione o colaborador.')
    if (motivo.trim().length < 5) {
      return setError('Explique por que essa pessoa foi destaque.')
    }

    setSaving(true)
    try {
      const result = await api.post('/api/highlights', {
        action: 'save',
        usuario_id: Number(usuarioId),
        funcao,
        periodo_tipo: periodo,
        data_base: dataBase,
        motivo,
      })
      setSuccess(result.message)
      setUsuarioId('')
      setMotivo('')
      setSearch('')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(item) {
    if (!window.confirm(`Remover a estrela de ${item.nome} deste período?`)) return
    setError('')
    setSuccess('')
    try {
      const result = await api.post('/api/highlights', { action: 'delete', id: item.id })
      setSuccess(result.message)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="activities-loading">Carregando destaques...</div>

  return (
    <section className="highlights-page">
      <div className="highlights-hero">
        <div>
          <span className="dashboard-kicker">RECONHECIMENTO DA OPERAÇÃO</span>
          <h1>{adminMode ? 'Gerenciar destaques' : 'Destaques da operação'}</h1>
          <p>
            {adminMode
              ? 'Escolha um destaque por função e registre o motivo do reconhecimento.'
              : 'Quem faz a diferença ganha uma estrela e deixa sua marca na operação.'}
          </p>
        </div>

        {!adminMode && (
          <div className="highlights-my-stars">
            <span>★</span>
            <div>
              <strong>{data?.minhas_estrelas || 0}</strong>
              <small>
                {Number(data?.minhas_estrelas || 0) === 1
                  ? 'estrela conquistada'
                  : 'estrelas conquistadas'}
              </small>
            </div>
          </div>
        )}
      </div>

      {error && <div className="activity-message error">{error}</div>}
      {success && <div className="activity-message success">{success}</div>}

      {adminMode && (
        <form className="highlight-admin-form" onSubmit={save}>
          <div className="highlight-admin-head">
            <div>
              <span className="dashboard-kicker">NOVA ESTRELA</span>
              <h2>Registrar destaque</h2>
            </div>
            <span>1 por função em cada período</span>
          </div>

          <div className="highlight-form-grid">
            <label>
              <span>Função</span>
              <select
                value={funcao}
                onChange={(e) => {
                  setFuncao(e.target.value)
                  setUsuarioId('')
                }}
              >
                {(data?.funcoes || []).map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>

            <label>
              <span>Período</span>
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                <option value="dia">Dia</option>
                <option value="semana">Semana</option>
                <option value="mes">Mês</option>
              </select>
            </label>

            <label>
              <span>Data de referência</span>
              <input type="date" value={dataBase} onChange={(e) => setDataBase(e.target.value)} />
            </label>
          </div>

          <div className="highlight-user-picker">
            <div className="activity-helper-search">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Buscar ${funcao.toLowerCase()}...`}
              />
              <span>{candidatos.length} disponível(is)</span>
            </div>

            <div className="highlight-candidates">
              {candidatos.map((user) => {
                const selected = String(usuarioId) === String(user.id)
                return (
                  <button
                    key={user.id}
                    type="button"
                    className={selected ? 'selected' : ''}
                    onClick={() => setUsuarioId(String(user.id))}
                  >
                    <UserAvatar
                      name={user.nome}
                      photo={user.foto_perfil}
                      className="highlight-candidate-avatar"
                    />
                    <span>
                      <strong>{user.nome}</strong>
                      <small>
                        {user.cargo || user.perfil}
                        {user.turno ? ` • ${user.turno}` : ''}
                      </small>
                    </span>
                    <b>{selected ? '✓' : '+'}</b>
                  </button>
                )
              })}
            </div>
          </div>

          {selectedUser && (
            <div className="highlight-selected-preview">
              <UserAvatar
                name={selectedUser.nome}
                photo={selectedUser.foto_perfil}
                className="highlight-selected-avatar"
              />
              <div>
                <span>Selecionado para receber a estrela</span>
                <strong>{selectedUser.nome}</strong>
              </div>
            </div>
          )}

          <label className="highlight-reason">
            <span>Por que ele(a) foi destaque?</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={1200}
              placeholder="Ex.: atitude de dono, produtividade, segurança, colaboração com o time..."
            />
          </label>

          <button className="primary-action-button" type="submit" disabled={saving}>
            {saving ? 'Salvando...' : '★ Dar estrela e publicar'}
          </button>
        </form>
      )}

      {!adminMode && (data?.meus_destaques || []).length > 0 && (
        <section className="my-highlight-history">
          <div>
            <span className="dashboard-kicker">SUAS CONQUISTAS</span>
            <h2>Minhas estrelas</h2>
          </div>

          <div className="my-stars-list">
            {data.meus_destaques.map((item) => (
              <article key={item.id}>
                <span>★</span>
                <div>
                  <strong>{item.funcao}</strong>
                  <small>{periodLabel(item)}</small>
                  <p>{item.motivo}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="highlights-wall">
        <div className="highlights-wall-head">
          <div>
            <span className="dashboard-kicker">MURAL DE RECONHECIMENTO</span>
            <h2>Estrelas da operação</h2>
          </div>
          <span>{data?.destaques?.length || 0} reconhecimento(s)</span>
        </div>

        <div className="highlights-grid">
          {(data?.destaques || []).map((item) => (
            <article className="highlight-card" key={item.id}>
              <div className="highlight-card-star">★</div>
              <UserAvatar
                name={item.nome}
                photo={item.foto_perfil}
                className="highlight-photo"
              />
              <span className="highlight-role">{item.funcao}</span>
              <h3>{item.nome}</h3>
              <small>{periodLabel(item)}</small>
              <p>{item.motivo}</p>
              <div className="highlight-card-footer">
                <strong>★ {item.estrelas}</strong>
                <span>{item.estrelas === 1 ? 'estrela acumulada' : 'estrelas acumuladas'}</span>
              </div>
              {adminMode && (
                <button
                  className="highlight-delete"
                  type="button"
                  onClick={() => remove(item)}
                >
                  Remover
                </button>
              )}
            </article>
          ))}

          {!data?.destaques?.length && (
            <div className="wallet-empty">Nenhum destaque cadastrado ainda.</div>
          )}
        </div>
      </section>
    </section>
  )
}
