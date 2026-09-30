import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import './ActivitiesScreen.css'

const PACKAGING_OPTIONS = ['PET', 'LATA', 'LONG NECK', 'RGB', 'BAG BOX']
const ANOMALY_OPTIONS = [
  'VAZAMENTO',
  'EMBALAGEM COM FUROS',
  'EMBALAGEM MOLHADA',
  'COR ALTERADO',
  'FALTA DE PRODUTO',
  'EMBALAGEM MURCHA',
  'PALLET QUEBRADO',
  'OUTROS',
]

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

function makeItem() {
  return {
    id: crypto.randomUUID(),
    embalagem: '',
    quantidade_plts: 1,
    motivo_anomalia: '',
    motivo_outros: '',
  }
}

function StatusBadge({ status }) {
  const labels = {
    pendente: 'Pendente',
    aprovado: 'Aprovado',
    reprovado: 'Reprovado',
  }
  return <span className={`activity-status ${status || 'pendente'}`}>{labels[status] || status}</span>
}

export default function SeloVermelhoScreen({ currentUser, onBack }) {
  const [data, setData] = useState(null)
  const [items, setItems] = useState([makeItem()])
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
      setData(await api.get('/api/activities/selo-vermelho'))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const unitValue = Number(data?.atividade?.valor_unitario || 0)
  const totalPlts = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(0, Number(item.quantidade_plts || 0)), 0),
    [items],
  )
  const totalValue = totalPlts * unitValue

  function updateItem(id, field, value) {
    setItems((current) =>
      current.map((item) => item.id === id ? { ...item, [field]: value } : item),
    )
  }

  function removeItem(id) {
    setItems((current) => current.length === 1 ? current : current.filter((item) => item.id !== id))
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

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (!item.embalagem) {
        setError(`Selecione a embalagem do item ${index + 1}.`)
        return
      }
      if (Number(item.quantidade_plts || 0) <= 0) {
        setError(`Informe a quantidade de PLTs do item ${index + 1}.`)
        return
      }
      if (!item.motivo_anomalia) {
        setError(`Selecione o motivo da anomalia do item ${index + 1}.`)
        return
      }
      if (item.motivo_anomalia === 'OUTROS' && !item.motivo_outros.trim()) {
        setError(`Descreva o motivo do item ${index + 1}.`)
        return
      }
    }

    if (!photo) {
      setError('Tire ou envie uma foto como evidência.')
      return
    }

    setSaving(true)
    try {
      const response = await api.post('/api/activities/selo-vermelho', {
        itens: items.map(({ embalagem, quantidade_plts, motivo_anomalia, motivo_outros }) => ({
          embalagem,
          quantidade_plts: Number(quantidade_plts),
          motivo_anomalia,
          motivo_outros,
        })),
        evidencia_foto: photo,
      })
      setSuccess(response.message)
      setItems([makeItem()])
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
    return <div className="activities-loading">Carregando Selo Vermelho...</div>
  }

  return (
    <section className="activities-page">
      <div className="activity-screen-header">
        <button className="activity-back-button" type="button" onClick={onBack}>←</button>
        <div>
          <span className="dashboard-kicker">ATIVIDADES • SELO VERMELHO</span>
          <h1>Selo Vermelho</h1>
          <p>Registre o tipo de embalagem, quantidade de PLTs, motivo da anomalia e a evidência.</p>
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
                <h2>Itens retrabalhados</h2>
              </div>
              <span className="activity-panel-count">{items.length} item(ns)</span>
            </div>

            <div className="selo-items-list">
              {items.map((item, index) => (
                <article className="selo-item-card" key={item.id}>
                  <div className="selo-item-head">
                    <strong>Item {index + 1}</strong>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(item.id)}>Remover</button>
                    )}
                  </div>

                  <div>
                    <span className="selo-field-label">Tipo de embalagem</span>
                    <div className="selo-packaging-grid">
                      {(data?.embalagens?.length ? data.embalagens : PACKAGING_OPTIONS).map((embalagem) => (
                        <button
                          type="button"
                          key={embalagem}
                          className={item.embalagem === embalagem ? 'active' : ''}
                          onClick={() => updateItem(item.id, 'embalagem', embalagem)}
                        >
                          <strong>{embalagem}</strong>
                          <small>
                            {embalagem === 'PET' && 'Garrafa PET'}
                            {embalagem === 'LATA' && 'Lata'}
                            {embalagem === 'LONG NECK' && 'Garrafa individual'}
                            {embalagem === 'RGB' && 'Retornável'}
                            {embalagem === 'BAG BOX' && 'Bag in box'}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="selo-item-fields">
                    <label>
                      <span>Quantos PLTs foram retrabalhados?</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantidade_plts}
                        onChange={(event) => updateItem(item.id, 'quantidade_plts', event.target.value)}
                      />
                    </label>

                    <label>
                      <span>Motivo da anomalia</span>
                      <select
                        value={item.motivo_anomalia}
                        onChange={(event) => updateItem(item.id, 'motivo_anomalia', event.target.value)}
                      >
                        <option value="">Selecione</option>
                        {(data?.motivos?.length ? data.motivos : ANOMALY_OPTIONS).map((motivo) => (
                          <option key={motivo} value={motivo}>{motivo}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {item.motivo_anomalia === 'OUTROS' && (
                    <label className="selo-other-field">
                      <span>Descreva o motivo</span>
                      <textarea
                        value={item.motivo_outros}
                        onChange={(event) => updateItem(item.id, 'motivo_outros', event.target.value)}
                        placeholder="Explique a anomalia encontrada..."
                        maxLength={1200}
                      />
                    </label>
                  )}
                </article>
              ))}
            </div>

            <button
              className="selo-add-item"
              type="button"
              onClick={() => setItems((current) => [...current, makeItem()])}
            >
              + Adicionar outro item
            </button>
          </section>

          <section className="activity-panel">
            <div className="activity-panel-heading">
              <div>
                <span className="activity-step">02</span>
                <h2>Evidência</h2>
              </div>
              <span className="activity-panel-count">Obrigatória</span>
            </div>

            {photo ? (
              <label className="activity-photo-preview selo-photo">
                <img src={photo} alt="Evidência do Selo Vermelho" />
                <span>Trocar foto</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(event) => choosePhoto(event.target.files?.[0])}
                />
              </label>
            ) : (
              <label className="activity-photo-empty selo-photo">
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
          <h2>Selo Vermelho</h2>

          <div className="activity-summary-row">
            <span>Responsável</span>
            <strong>{currentUser?.nome || 'Usuário'}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Itens</span>
            <strong>{items.length}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Total de PLTs</span>
            <strong>{totalPlts}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Valor por PLT</span>
            <strong>{money(unitValue)}</strong>
          </div>
          <div className="activity-summary-row total">
            <span>Total do lançamento</span>
            <strong>{money(totalValue)}</strong>
          </div>

          <p>O cálculo é feito pela quantidade total de PLTs retrabalhados.</p>

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
                  <strong>Selo Vermelho #{item.id}</strong>
                  <small>{formatDate(item.criado_em)}</small>
                </div>
                <span>{item.detalhes?.total_plts || 0} PLT(s) • {item.detalhes?.itens?.length || 0} item(ns)</span>
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
