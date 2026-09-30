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
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)

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
  return <span className={`activity-status ${status || 'pendente'}`}>{labels[status] || status}</span>
}

export default function SeparacaoScreen({ currentUser, onBack }) {
  const [data, setData] = useState(null)
  const [tipo, setTipo] = useState('')
  const [hasHelper, setHasHelper] = useState(false)
  const [helperId, setHelperId] = useState('')
  const [peopleSearch, setPeopleSearch] = useState('')
  const [mapa, setMapa] = useState('')
  const [placa, setPlaca] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [photo, setPhoto] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await api.get('/api/activities/separacao'))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const tipos = data?.tipos || []
  const users = data?.usuarios || []
  const selectedType = tipos.find((item) => item.chave === tipo)
  const selectedHelper = users.find((person) => String(person.id) === String(helperId))

  const filteredUsers = useMemo(() => {
    const text = peopleSearch.trim().toLowerCase()
    if (!text) return users
    return users.filter((person) =>
      [person.nome, person.turno, person.perfil]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text)),
    )
  }, [users, peopleSearch])

  const quantidadeCalculo = selectedType?.tipo_calculo === 'por_plt'
    ? Math.max(0, Number(quantidade || 0))
    : selectedType ? 1 : 0

  const valorPorPessoa = Number(selectedType?.valor_unitario || 0) * quantidadeCalculo
  const participantes = hasHelper && helperId ? 2 : 1
  const totalGrupo = valorPorPessoa * participantes

  async function choosePhoto(file) {
    if (!file) return
    setError('')
    try {
      setPhoto(await compressEvidence(file))
    } catch (photoError) {
      setError(photoError.message)
    }
  }

  function chooseType(nextType) {
    setTipo(nextType.chave)
    if (!nextType.exige_mapa) setMapa('')
    if (!nextType.exige_placa) setPlaca('')
    if (nextType.tipo_calculo !== 'por_plt') setQuantidade(1)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!selectedType) {
      setError('Selecione o tipo de separação.')
      return
    }

    if (selectedType.tipo_calculo === 'por_plt' && Number(quantidade || 0) <= 0) {
      setError('Informe a quantidade de PLTs.')
      return
    }

    if (selectedType.exige_mapa && !mapa.trim()) {
      setError('Informe o número do mapa.')
      return
    }

    if (selectedType.exige_placa && !placa.trim()) {
      setError('Informe a placa do veículo.')
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
      const response = await api.post('/api/activities/separacao', {
        tipo_atividade: selectedType.chave,
        ajudante_usuario_id: hasHelper ? Number(helperId) : 0,
        numero_mapa: mapa,
        placa_veiculo: placa,
        quantidade_plt: Number(quantidade || 0),
        evidencia_foto: photo,
      })

      setSuccess(response.message)
      setTipo('')
      setHasHelper(false)
      setHelperId('')
      setPeopleSearch('')
      setMapa('')
      setPlaca('')
      setQuantidade(1)
      setPhoto('')
      await load()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="activities-loading">Carregando Separação...</div>
  }

  return (
    <section className="activities-page">
      <div className="activity-screen-header">
        <button className="activity-back-button" type="button" onClick={onBack}>←</button>
        <div>
          <span className="dashboard-kicker">ATIVIDADES • SEPARAÇÃO</span>
          <h1>Separação</h1>
          <p>Escolha a atividade, informe os dados necessários e envie uma única evidência.</p>
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
                <h2>Tipo de separação</h2>
              </div>
              <span className="activity-panel-count">{selectedType ? money(selectedType.valor_unitario) : 'Selecione'}</span>
            </div>

            <div className="separacao-type-grid">
              {tipos.map((item) => (
                <button
                  key={item.chave}
                  type="button"
                  className={tipo === item.chave ? 'active' : ''}
                  onClick={() => chooseType(item)}
                >
                  <strong>{item.nome}</strong>
                  <small>
                    {money(item.valor_unitario)}
                    {item.tipo_calculo === 'por_plt' ? ' por PLT' : ''}
                  </small>
                </button>
              ))}
            </div>
          </section>

          {selectedType && (
            <section className="activity-panel">
              <div className="activity-panel-heading">
                <div>
                  <span className="activity-step">02</span>
                  <h2>Dados da atividade</h2>
                </div>
                <span className="activity-panel-count">{selectedType.nome}</span>
              </div>

              <div className="separacao-fields">
                {selectedType.tipo_calculo === 'por_plt' && (
                  <label>
                    <span>Quantidade de pallets (PLTs)</span>
                    <input
                      type="number"
                      min="1"
                      max="99999"
                      step="1"
                      value={quantidade}
                      onChange={(event) => setQuantidade(event.target.value)}
                    />
                  </label>
                )}

                {selectedType.exige_mapa && (
                  <label>
                    <span>Número do mapa</span>
                    <input
                      value={mapa}
                      onChange={(event) => setMapa(event.target.value.toUpperCase())}
                      placeholder="Ex.: 123456"
                    />
                  </label>
                )}

                {selectedType.exige_placa && (
                  <label>
                    <span>Placa do veículo</span>
                    <input
                      value={placa}
                      onChange={(event) => setPlaca(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      placeholder="Ex.: ABC1D23"
                      maxLength={20}
                    />
                  </label>
                )}

                {selectedType.tipo_calculo !== 'por_plt' && !selectedType.exige_mapa && !selectedType.exige_placa && (
                  <div className="separacao-simple-note">
                    <strong>Atividade de valor fixo</strong>
                    <span>Não precisa informar mapa, placa ou quantidade de PLTs.</span>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div>
                <span className="activity-step">03</span>
                <h2>Participantes</h2>
              </div>
              <span className="activity-panel-count">{participantes} pessoa(s)</span>
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
                <small>Se sim, o mesmo lançamento dará crédito aos dois após aprovação.</small>
              </div>

              <div className="amarracao-helper-options" role="group" aria-label="Teve segundo ajudante?">
                <button
                  type="button"
                  className={!hasHelper ? 'active' : ''}
                  onClick={() => {
                    setHasHelper(false)
                    setHelperId('')
                  }}
                >
                  Não
                </button>
                <button
                  type="button"
                  className={hasHelper ? 'active' : ''}
                  onClick={() => setHasHelper(true)}
                >
                  Sim
                </button>
              </div>
            </div>

            {hasHelper && (
              <>
                <div className="amarracao-helper-label">
                  <strong>Quem foi o segundo ajudante?</strong>
                  <small>Selecione o colaborador que participou da separação.</small>
                </div>

                <div className="activity-helper-search">
                  <input
                    type="search"
                    placeholder="Buscar por nome ou turno..."
                    value={peopleSearch}
                    onChange={(event) => setPeopleSearch(event.target.value)}
                  />
                  <span>{selectedHelper ? selectedHelper.nome : 'Selecione 1 ajudante'}</span>
                </div>

                <div className="activity-people-grid">
                  {filteredUsers.map((person) => {
                    const selected = String(helperId) === String(person.id)
                    return (
                      <button
                        key={person.id}
                        type="button"
                        className={`activity-person-option ${selected ? 'selected' : ''}`}
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
                <span className="activity-step">04</span>
                <h2>Evidência</h2>
              </div>
              <span className="activity-panel-count">Obrigatória</span>
            </div>

            {photo ? (
              <label className="activity-photo-preview separacao-photo">
                <img src={photo} alt="Evidência da separação" />
                <span>Trocar foto</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(event) => choosePhoto(event.target.files?.[0])}
                />
              </label>
            ) : (
              <label className="activity-photo-empty separacao-photo">
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
        </div>

        <aside className="activity-summary-card">
          <span className="dashboard-kicker">RESUMO</span>
          <h2>Separação</h2>

          <div className="activity-summary-row">
            <span>Tipo</span>
            <strong>{selectedType?.nome || '—'}</strong>
          </div>
          {selectedType?.tipo_calculo === 'por_plt' && (
            <div className="activity-summary-row">
              <span>PLTs</span>
              <strong>{quantidadeCalculo}</strong>
            </div>
          )}
          {selectedType?.exige_mapa && (
            <div className="activity-summary-row">
              <span>Mapa</span>
              <strong>{mapa || '—'}</strong>
            </div>
          )}
          {selectedType?.exige_placa && (
            <div className="activity-summary-row">
              <span>Placa</span>
              <strong>{placa || '—'}</strong>
            </div>
          )}
          <div className="activity-summary-row">
            <span>Segundo ajudante</span>
            <strong>{selectedHelper?.nome || 'Não'}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Valor por pessoa</span>
            <strong>{money(valorPorPessoa)}</strong>
          </div>
          <div className="activity-summary-row total">
            <span>Total do grupo</span>
            <strong>{money(totalGrupo)}</strong>
          </div>

          <p>O ADM recebe um único lançamento e a decisão vale para todos os participantes.</p>

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
                  <strong>{item.atividade_nome} #{item.id}</strong>
                  <small>{formatDate(item.criado_em)}</small>
                </div>
                <span>
                  {item.detalhes?.tipo_calculo === 'por_plt'
                    ? `${item.detalhes?.quantidade_plt || 0} PLT(s)`
                    : 'Valor fixo'}
                  {item.detalhes?.ajudante_nome ? ` • Com ${item.detalhes.ajudante_nome}` : ''}
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
