import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import './ActivitiesScreen.css'

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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
  const scale = Math.min(1, 1280 / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  let quality = 0.78
  let compressed = canvas.toDataURL('image/jpeg', quality)
  while (compressed.length > 820000 && quality > 0.38) {
    quality -= 0.08
    compressed = canvas.toDataURL('image/jpeg', quality)
  }
  if (compressed.length > 900000) throw new Error('A foto ficou muito grande. Tente outra imagem.')
  return compressed
}

export default function IntegralizacaoDevolucaoScreen({ currentUser, onBack }) {
  const [data, setData] = useState(null)
  const [selectedHelpers, setSelectedHelpers] = useState([])
  const [search, setSearch] = useState('')
  const [integralizacao100, setIntegralizacao100] = useState(true)
  const [motivo, setMotivo] = useState('')
  const [photo, setPhoto] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await api.get('/api/activities/integralizacao-devolucao'))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  const users = data?.usuarios || []
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => [u.nome, u.turno, u.perfil].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
  }, [users, search])

  function toggleHelper(id) {
    setSelectedHelpers((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length < 20 ? [...current, id] : current,
    )
  }

  async function choosePhoto(file) {
    if (!file) return
    setError('')
    try {
      setPhoto(await compressEvidence(file))
    } catch (e) {
      setError(e.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!integralizacao100 && !motivo.trim()) {
      setError('Informe o motivo quando não conseguir integralizar 100%.')
      return
    }
    if (!photo) {
      setError('Tire ou envie uma foto como evidência.')
      return
    }

    setSaving(true)
    try {
      const response = await api.post('/api/activities/integralizacao-devolucao', {
        ajudantes_usuario_ids: selectedHelpers,
        integralizacao_100: integralizacao100,
        motivo_nao_integralizado: motivo,
        evidencia_foto: photo,
      })
      setSuccess(response.message)
      setSelectedHelpers([])
      setSearch('')
      setIntegralizacao100(true)
      setMotivo('')
      setPhoto('')
      await load()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="activities-loading">Carregando Integralização da Devolução...</div>

  const unitValue = Number(data?.atividade?.valor_unitario || 0)
  const effectiveValue = integralizacao100 ? unitValue : unitValue * 0.5
  const participants = selectedHelpers.length + 1

  return (
    <section className="activities-page">
      <div className="activity-screen-header">
        <button className="activity-back-button" type="button" onClick={onBack}>←</button>
        <div>
          <span className="dashboard-kicker">ATIVIDADES • INTEGRALIZAÇÃO DA DEVOLUÇÃO</span>
          <h1>Integralização da Devolução</h1>
          <p>Informe os participantes, confirme a integralização e envie a evidência.</p>
        </div>
      </div>

      {error && <div className="activity-message error">{error}</div>}
      {success && <div className="activity-message success">{success}</div>}
      <form className="five-s-layout" onSubmit={submit}>
        <div className="five-s-main">
          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div><span className="activity-step">01</span><h2>Participantes</h2></div>
              <span className="activity-panel-count">{participants} pessoa(s)</span>
            </div>

            <div className="activity-principal-person">
              <span className="activity-person-avatar">{String(currentUser?.nome || 'U').charAt(0).toUpperCase()}</span>
              <div>
                <strong>{currentUser?.nome || 'Usuário logado'}</strong>
                <small>Responsável pelo lançamento • {currentUser?.turno || 'Turno não informado'}</small>
              </div>
              <span className="activity-person-role">Principal</span>
            </div>

            <div className="activity-helper-search">
              <input type="search" placeholder="Buscar ajudante por nome ou turno..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <span>{selectedHelpers.length} ajudante(s)</span>
            </div>

            <div className="activity-people-grid">
              {filteredUsers.map((person) => {
                const selected = selectedHelpers.includes(person.id)
                return (
                  <button type="button" key={person.id} className={`activity-person-option ${selected ? 'selected' : ''}`} onClick={() => toggleHelper(person.id)}>
                    <span className="activity-person-avatar">{String(person.nome || 'U').charAt(0).toUpperCase()}</span>
                    <span className="activity-person-option-copy"><strong>{person.nome}</strong><small>{person.turno || 'Sem turno'} • {person.perfil || 'Colaborador'}</small></span>
                    <span className="activity-check">{selected ? '✓' : '+'}</span>
                  </button>
                )
              })}
            </div>
          </section>
          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div><span className="activity-step">02</span><h2>Integralização</h2></div>
              <span className="activity-panel-count">{integralizacao100 ? '100%' : 'Parcial'}</span>
            </div>

            <div className="integralizacao-choice">
              <button type="button" className={integralizacao100 ? 'active' : ''} onClick={() => { setIntegralizacao100(true); setMotivo('') }}>
                <strong>Sim, 100%</strong><small>Devolução totalmente integralizada</small>
              </button>
              <button type="button" className={!integralizacao100 ? 'active warning' : ''} onClick={() => setIntegralizacao100(false)}>
                <strong>Não, ficou pendência</strong><small>Informar o motivo obrigatório</small>
              </button>
            </div>

            {!integralizacao100 && (
              <label className="selo-other-field">
                <span>Motivo da não integralização 100%</span>
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Explique o que impediu a integralização completa..." maxLength={2000} />
              </label>
            )}
          </section>

          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div><span className="activity-step">03</span><h2>Evidência</h2></div>
              <span className="activity-panel-count">Obrigatória</span>
            </div>
            <label className={photo ? 'activity-photo-preview retorno-photo' : 'activity-photo-empty retorno-photo'}>
              {photo ? <img src={photo} alt="Evidência" /> : <><span className="activity-photo-camera">▣</span><strong>Tirar ou anexar foto</strong><small>JPG, PNG ou WEBP</small></>}
              {photo && <span>Trocar foto</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/*" onChange={(e) => choosePhoto(e.target.files?.[0])} />
            </label>
          </section>
        </div>
        <aside className="activity-summary-card">
          <span className="dashboard-kicker">RESUMO</span>
          <h2>Integralização da Devolução</h2>
          <div className="activity-summary-row"><span>Participantes</span><strong>{participants}</strong></div>
          <div className="activity-summary-row"><span>Integralização</span><strong>{integralizacao100 ? '100%' : 'Não 100%'}</strong></div>
          <div className="activity-summary-row"><span>Valor por pessoa</span><strong>{money(effectiveValue)}</strong></div>
          <div className="activity-summary-row total"><span>Total estimado</span><strong>{money(effectiveValue * participants)}</strong></div>
          <p>O ADM aprova ou reprova uma vez para todo o grupo. Valores individuais configurados pelo ADM são preservados no lançamento.</p>
          <button className="activity-submit-button" type="submit" disabled={saving}>{saving ? 'Enviando...' : 'Enviar para aprovação'}</button>
        </aside>
      </form>
    </section>
  )
}
