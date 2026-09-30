import { useEffect, useState } from 'react'
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

export default function RepackScreen({ currentUser, onBack }) {
  const [data, setData] = useState(null)
  const [tipo, setTipo] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [photo, setPhoto] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try { setData(await api.get('/api/activities/repack')) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  const tipos = data?.tipos || []
  const selectedType = tipos.find((item) => item.chave === tipo)

  async function choosePhoto(file) {
    if (!file) return
    try { setPhoto(await compressEvidence(file)) }
    catch (e) { setError(e.message) }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!selectedType) return setError('Selecione o tipo do SKU recuperado.')
    if (Number(quantidade) <= 0) return setError('Informe a quantidade em caixas.')
    if (!photo) return setError('Tire ou envie uma foto como evidência.')

    setSaving(true)
    try {
      const response = await api.post('/api/activities/repack', {
        tipo_sku: selectedType.chave,
        quantidade_caixas: Number(quantidade),
        evidencia_foto: photo,
      })
      setSuccess(response.message)
      setTipo('')
      setQuantidade(1)
      setPhoto('')
      await load()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="activities-loading">Carregando Repack...</div>

  const valorPessoa = Number(selectedType?.valor_unitario || 0) * Number(quantidade || 0)

  return (
    <section className="activities-page">
      <div className="activity-screen-header">
        <button className="activity-back-button" type="button" onClick={onBack}>←</button>
        <div>
          <span className="dashboard-kicker">ATIVIDADES • REPACK</span>
          <h1>Repack</h1>
          <p>Selecione o SKU recuperado, informe a quantidade de caixas e envie a sua evidência.</p>
        </div>
      </div>
      {error && <div className="activity-message error">{error}</div>}
      {success && <div className="activity-message success">{success}</div>}

      <form className="five-s-layout" onSubmit={submit}>
        <div className="five-s-main">
          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div><span className="activity-step">01</span><h2>SKU recuperado</h2></div>
              <span className="activity-panel-count">{selectedType ? money(selectedType.valor_unitario) + ' / caixa' : 'Selecione'}</span>
            </div>
            <div className="repack-type-grid">
              {tipos.map((item) => (
                <button type="button" key={item.chave} className={tipo === item.chave ? 'active' : ''} onClick={() => setTipo(item.chave)}>
                  <strong>{item.nome}</strong>
                  <small>{money(item.valor_unitario)} por caixa</small>
                </button>
              ))}
            </div>
            <label className="repack-quantity">
              <span>Quantidade em caixas</span>
              <input type="number" min="1" step="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </label>
          </section>

          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div><span className="activity-step">02</span><h2>Evidência</h2></div>
              <span className="activity-panel-count">Obrigatória</span>
            </div>
            <label className={photo ? 'activity-photo-preview retorno-photo' : 'activity-photo-empty retorno-photo'}>
              {photo ? <img src={photo} alt="Evidência do Repack" /> : <><span className="activity-photo-camera">▣</span><strong>Tirar ou anexar foto</strong><small>JPG, PNG ou WEBP</small></>}
              {photo && <span>Trocar foto</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/*" onChange={(e) => choosePhoto(e.target.files?.[0])} />
            </label>
          </section>
        </div>
        <aside className="activity-summary-card">
          <span className="dashboard-kicker">RESUMO</span>
          <h2>Repack</h2>
          <div className="activity-summary-row"><span>SKU</span><strong>{selectedType?.nome || '—'}</strong></div>
          <div className="activity-summary-row"><span>Caixas</span><strong>{Number(quantidade || 0)}</strong></div>
          <div className="activity-summary-row"><span>Valor por pessoa</span><strong>{money(valorPessoa)}</strong></div>
          <div className="activity-summary-row total"><span>Total estimado</span><strong>{money(valorPessoa)}</strong></div>
          <p>Este lançamento é individual. Cada colaborador registra o próprio Repack.</p>
          <button className="activity-submit-button" type="submit" disabled={saving}>{saving ? 'Enviando...' : 'Enviar para aprovação'}</button>
        </aside>
      </form>
    </section>
  )
}
