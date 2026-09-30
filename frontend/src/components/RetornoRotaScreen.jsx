import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import './ActivitiesScreen.css'

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

async function compressEvidence(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Selecione uma imagem válida.')

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

  if (compressed.length > 900_000) throw new Error('A foto ficou muito grande. Tente outra imagem.')
  return compressed
}

export default function RetornoRotaScreen({ currentUser, onBack }) {
  const [data, setData] = useState(null)
  const [tipo, setTipo] = useState('')
  const [selectedHelpers, setSelectedHelpers] = useState([])
  const [peopleSearch, setPeopleSearch] = useState('')
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
      setData(await api.get('/api/activities/retorno-rota'))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const tipos = data?.tipos || []
  const users = data?.usuarios || []
  const selectedType = tipos.find((item) => item.chave === tipo)
  const helpers = users.filter((user) => selectedHelpers.includes(user.id))

  const filteredUsers = useMemo(() => {
    const search = peopleSearch.trim().toLowerCase()
    if (!search) return users

    return users.filter((person) =>
      [person.nome, person.turno, person.perfil]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    )
  }, [users, peopleSearch])

  function toggleHelper(id) {
    setSelectedHelpers((current) =>
      current.includes(id)
        ? current.filter((userId) => userId !== id)
        : current.length < 20
          ? [...current, id]
          : current,
    )
  }

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

    if (!selectedType) {
      setError('Selecione a atividade realizada.')
      return
    }

    if (!photo) {
      setError('Tire ou envie uma foto como evidência.')
      return
    }

    setSaving(true)
    try {
      const response = await api.post('/api/activities/retorno-rota', {
        tipo_atividade: selectedType.chave,
        ajudantes_usuario_ids: selectedHelpers,
        evidencia_foto: photo,
      })

      setSuccess(response.message)
      setTipo('')
      setSelectedHelpers([])
      setPeopleSearch('')
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
    return <div className="activities-loading">Carregando Retorno de Rota...</div>
  }

  const valorPrincipal = Number(selectedType?.valor_unitario || 0)
  const totalGrupo = valorPrincipal * (selectedHelpers.length + 1)

  return (
    <section className="activities-page">
      <div className="activity-screen-header">
        <button className="activity-back-button" type="button" onClick={onBack}>←</button>
        <div>
          <span className="dashboard-kicker">ATIVIDADES • RETORNO DE ROTA</span>
          <h1>Retorno de Rota</h1>
          <p>Escolha a atividade, informe quem participou e envie a evidência.</p>
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
                <h2>Qual atividade foi realizada?</h2>
              </div>
              <span className="activity-panel-count">
                {selectedType ? money(selectedType.valor_unitario) : 'Selecione'}
              </span>
            </div>

            <div className="retorno-type-grid">
              {tipos.map((item) => (
                <button
                  key={item.chave}
                  type="button"
                  className={tipo === item.chave ? 'active' : ''}
                  onClick={() => setTipo(item.chave)}
                >
                  <strong>{item.nome}</strong>
                  <small>{money(item.valor_unitario)} por pessoa</small>
                </button>
              ))}
            </div>
          </section>

          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div>
                <span className="activity-step">02</span>
                <h2>Participantes</h2>
              </div>
              <span className="activity-panel-count">{selectedHelpers.length + 1} pessoa(s)</span>
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

            <div className="activity-helper-search">
              <input
                type="search"
                placeholder="Buscar ajudante por nome ou turno..."
                value={peopleSearch}
                onChange={(event) => setPeopleSearch(event.target.value)}
              />
              <span>{selectedHelpers.length} ajudante(s) selecionado(s)</span>
            </div>

            <div className="activity-people-grid">
              {filteredUsers.map((person) => {
                const selected = selectedHelpers.includes(person.id)
                return (
                  <button
                    key={person.id}
                    type="button"
                    className={`activity-person-option ${selected ? 'selected' : ''}`}
                    onClick={() => toggleHelper(person.id)}
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
              <label className="activity-photo-preview retorno-photo">
                <img src={photo} alt="Evidência do Retorno de Rota" />
                <span>Trocar foto</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => choosePhoto(event.target.files?.[0])}
                />
              </label>
            ) : (
              <label className="activity-photo-empty retorno-photo">
                <span className="activity-photo-camera">▣</span>
                <strong>Tirar ou anexar foto</strong>
                <small>JPG, PNG ou WEBP</small>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => choosePhoto(event.target.files?.[0])}
                />
              </label>
            )}
          </section>
        </div>

        <aside className="activity-summary-card">
          <span className="dashboard-kicker">RESUMO</span>
          <h2>Retorno de Rota</h2>
          <div className="activity-summary-row">
            <span>Atividade</span>
            <strong>{selectedType?.nome || '—'}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Participantes</span>
            <strong>{selectedHelpers.length + 1}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Ajudantes</span>
            <strong>{helpers.length ? helpers.map((item) => item.nome).join(', ') : 'Nenhum'}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Valor base</span>
            <strong>{money(valorPrincipal)}</strong>
          </div>
          <div className="activity-summary-row total">
            <span>Total estimado do grupo</span>
            <strong>{money(totalGrupo)}</strong>
          </div>

          <p>O ADM aprova ou reprova o grupo de uma vez. Cada participante recebe conforme o valor configurado para ele.</p>

          <button className="activity-submit-button" type="submit" disabled={saving}>
            {saving ? 'Enviando...' : 'Enviar para aprovação'}
          </button>
        </aside>
      </form>
    </section>
  )
}
