import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import './ActivitiesScreen.css'

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

async function compressEvidence(file) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Selecione uma imagem válida.')
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler a foto.'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })

  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('Não foi possível abrir a foto.'))
    img.onload = () => resolve(img)
    img.src = dataUrl
  })

  const maxSide = 1280
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))

  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  let quality = 0.78
  let compressed = canvas.toDataURL('image/jpeg', quality)

  while (compressed.length > 820_000 && quality > 0.38) {
    quality -= 0.08
    compressed = canvas.toDataURL('image/jpeg', quality)
  }

  if (compressed.length > 900_000) {
    throw new Error('A foto ficou muito grande. Tente outra imagem.')
  }

  return compressed
}

function StatusBadge({ status }) {
  const labels = {
    pendente: 'Pendente',
    aprovado: 'Aprovado',
    reprovado: 'Reprovado',
  }

  return (
    <span className={\`activity-status \${status || 'pendente'}\`}>
      {labels[status] || status}
    </span>
  )
}

export default function AmarracaoScreen({ currentUser, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [mapaOp, setMapaOp] = useState('')
  const [placa, setPlaca] = useState('')
  const [hasHelper, setHasHelper] = useState(false)
  const [helperId, setHelperId] = useState('')
  const [search, setSearch] = useState('')
  const [photo, setPhoto] = useState('')
  const [observation, setObservation] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/api/activities/amarracao')
      setData(response)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const users = data?.usuarios || []
  const value = Number(data?.atividade?.valor_unitario || 0)

  const filteredUsers = useMemo(() => {
    const text = search.trim().toLowerCase()
    if (!text) return users

    return users.filter((person) =>
      [person.nome, person.turno, person.perfil]
        .filter(Boolean)
        .some((item) => String(item).toLowerCase().includes(text)),
    )
  }, [users, search])

  const selectedHelper = users.find((person) => String(person.id) === String(helperId))
  const participants = hasHelper && helperId ? 2 : 1

  async function choosePhoto(file) {
    if (!file) return
    setError('')

    try {
      setPhoto(await compressEvidence(file))
    } catch (photoError) {
      setError(photoError.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const normalizedMap = mapaOp.trim().toUpperCase().replace(/\s+/g, ' ')
    const normalizedPlate = placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

    if (!normalizedMap) {
      setError('Informe o Mapa ou OP.')
      return
    }

    if (!normalizedPlate) {
      setError('Informe a placa do cavalo.')
      return
    }

    if (hasHelper && !helperId) {
      setError('Selecione o segundo ajudante.')
      return
    }

    if (!photo) {
      setError('Tire ou envie uma foto como evidência.')
      return
    }

    setSaving(true)

    try {
      const response = await api.post('/api/activities/amarracao', {
        mapa_op: normalizedMap,
        placa_cavalo: normalizedPlate,
        ajudante_usuario_id: hasHelper ? Number(helperId) : 0,
        evidencia_foto: photo,
        observacao: observation,
      })

      setSuccess(response.message)
      setMapaOp('')
      setPlaca('')
      setHasHelper(false)
      setHelperId('')
      setSearch('')
      setPhoto('')
      setObservation('')
      await load()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="activities-loading">Carregando Amarração...</div>
  }

  return (
    <section className="activities-page">
      <div className="activity-screen-header">
        <button className="activity-back-button" type="button" onClick={onBack}>←</button>
        <div>
          <span className="dashboard-kicker">ATIVIDADES • AMARRAÇÃO</span>
          <h1>Amarração</h1>
          <p>
            Informe Mapa/OP, placa do cavalo, segundo ajudante quando houver e a foto da evidência.
          </p>
        </div>
      </div>

      {error && <div className="activity-message error">{error}</div>}
      {success && <div className="activity-message success">{success}</div>}

      <form className="five-s-layout" onSubmit={submit}>
        <div className="five-s-main">
          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div>
                <span className="activity-step">01</span>
                <h2>Dados da atividade</h2>
              </div>
              <span className="activity-panel-count">{money(value)} por pessoa</span>
            </div>

            <div className="amarracao-fields">
              <label>
                <span>Mapa ou OP</span>
                <input
                  value={mapaOp}
                  onChange={(event) => setMapaOp(event.target.value.toUpperCase())}
                  placeholder="Ex.: 123456"
                  maxLength={80}
                />
              </label>

              <label>
                <span>Placa do cavalo</span>
                <input
                  value={placa}
                  onChange={(event) =>
                    setPlaca(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
                  placeholder="Ex.: ABC1D23"
                  maxLength={20}
                />
              </label>
            </div>
          </section>

          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div>
                <span className="activity-step">02</span>
                <h2>Participantes</h2>
              </div>
              <span className="activity-panel-count">{participants} pessoa(s)</span>
            </div>

            <div className="activity-principal-person">
              <span className="activity-person-avatar">
                {String(currentUser?.nome || 'U').trim().charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{currentUser?.nome || 'Usuário logado'}</strong>
                <small>Responsável pelo lançamento • {currentUser?.turno || 'Turno não informado'}</small>
              </div>
              <span className="activity-person-role">Principal</span>
            </div>

            <div className="amarracao-helper-switch">
              <div>
                <strong>Teve segundo ajudante?</strong>
                <small>Se sim, o valor será creditado para os dois após aprovação.</small>
              </div>
              <button
                type="button"
                className={hasHelper ? 'active' : ''}
                onClick={() => {
                  setHasHelper((current) => !current)
                  if (hasHelper) setHelperId('')
                }}
              >
                {hasHelper ? 'Sim' : 'Não'}
              </button>
            </div>

            {hasHelper && (
              <>
                <div className="activity-helper-search">
                  <input
                    type="search"
                    placeholder="Buscar ajudante por nome ou turno..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <span>{selectedHelper ? '1 selecionado' : 'Selecione 1 ajudante'}</span>
                </div>

                <div className="activity-people-grid">
                  {filteredUsers.map((person) => {
                    const selected = String(helperId) === String(person.id)

                    return (
                      <button
                        className={\`activity-person-option \${selected ? 'selected' : ''}\`}
                        type="button"
                        key={person.id}
                        onClick={() => setHelperId(selected ? '' : String(person.id))}
                      >
                        <span className="activity-person-avatar">
                          {String(person.nome || 'U').trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="activity-person-option-copy">
                          <strong>{person.nome}</strong>
                          <small>{person.turno || 'Sem turno'} • {person.perfil || 'Colaborador'}</small>
                        </span>
                        <span className="activity-check">{selected ? '✓' : '+'}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </section>

          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div>
                <span className="activity-step">03</span>
                <h2>Evidência</h2>
              </div>
              <span className="activity-panel-count">Obrigatória</span>
            </div>

            {photo ? (
              <label className="activity-photo-preview amarracao-photo">
                <img src={photo} alt="Evidência da amarração" />
                <span>Trocar foto</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(event) => choosePhoto(event.target.files?.[0])}
                />
              </label>
            ) : (
              <label className="activity-photo-empty amarracao-photo">
                <span className="activity-photo-camera">▣</span>
                <strong>Tirar ou anexar foto</strong>
                <small>JPG, PNG ou WEBP</small>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(event) => choosePhoto(event.target.files?.[0])}
                />
              </label>
            )}
          </section>

          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div>
                <span className="activity-step">04</span>
                <h2>Observação</h2>
              </div>
              <span className="activity-panel-count">Opcional</span>
            </div>

            <textarea
              className="activity-observation"
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              placeholder="Inclua alguma informação importante sobre a amarração..."
              maxLength={3000}
            />
          </section>
        </div>

        <aside className="activity-summary-card">
          <span className="dashboard-kicker">RESUMO</span>
          <h2>Amarração</h2>

          <div className="activity-summary-row">
            <span>Mapa/OP</span>
            <strong>{mapaOp.trim() || '—'}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Placa</span>
            <strong>{placa || '—'}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Participantes</span>
            <strong>{participants}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Valor por pessoa</span>
            <strong>{money(value)}</strong>
          </div>
          <div className="activity-summary-row total">
            <span>Total do grupo</span>
            <strong>{money(value * participants)}</strong>
          </div>

          <p>
            O ADM recebe um único lançamento para revisar e a decisão vale para todos os participantes.
          </p>

          <button className="activity-submit-button" type="submit" disabled={saving}>
            {saving ? 'Enviando...' : 'Enviar para aprovação'}
          </button>
        </aside>
      </form>

      {data?.lancamentos?.length > 0 && (
        <section className="activity-history">
          <div className="activity-history-heading">
            <div>
              <span className="dashboard-kicker">SEUS ÚLTIMOS LANÇAMENTOS</span>
              <h2>Acompanhamento</h2>
            </div>
          </div>

          <div className="activity-history-list">
            {data.lancamentos.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>Amarração #{item.id}</strong>
                  <small>{formatDate(item.criado_em)}</small>
                </div>
                <span>
                  Mapa/OP {item.detalhes?.mapa_op || '—'} • Placa {item.detalhes?.placa_cavalo || '—'}
                </span>
                <StatusBadge status={item.status} />
                {item.status === 'reprovado' && item.motivo_reprovacao && (
                  <p className="activity-history-reason">
                    <strong>Motivo:</strong> {item.motivo_reprovacao}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
