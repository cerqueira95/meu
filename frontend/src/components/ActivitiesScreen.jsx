import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import AmarracaoScreen from './AmarracaoScreen.jsx'
import SeloVermelhoScreen from './SeloVermelhoScreen.jsx'
import SeparacaoScreen from './SeparacaoScreen.jsx'
import RetornoRotaScreen from './RetornoRotaScreen.jsx'
import IntegralizacaoDevolucaoScreen from './IntegralizacaoDevolucaoScreen.jsx'
import RepackScreen from './RepackScreen.jsx'
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
    <span className={`activity-status ${status || 'pendente'}`}>
      {labels[status] || status}
    </span>
  )
}

function ActivityCatalog({ isAdmin, onOpen5s, onOpenAmarracao, onOpenSeloVermelho, onOpenSeparacao, onOpenRetornoRota, onOpenIntegralizacaoDevolucao, onOpenRepack, onOpenApprovals }) {
  return (
    <section className="activities-page">
      <div className="activities-hero">
        <div>
          <span className="dashboard-kicker">ROTINA OPERACIONAL</span>
          <h1>Atividades</h1>
          <p>
            Registre as atividades do armazém em um fluxo simples, com participantes,
            áreas e evidências organizadas no mesmo lançamento.
          </p>
        </div>

        {isAdmin && (
          <button className="activities-review-button" type="button" onClick={onOpenApprovals}>
            <span className="activities-review-icon">✓</span>
            <span>
              <small>GESTÃO</small>
              <strong>Aprovar atividades</strong>
            </span>
          </button>
        )}
      </div>

      <div className="activities-grid">
        <button className="activity-module-card available" type="button" onClick={onOpen5s}>
          <span className="activity-module-icon">✨</span>
          <div className="activity-module-copy">
            <div className="activity-module-title">
              <h2>5S</h2>
              <span>Disponível</span>
            </div>
            <p>
              Selecione as áreas realizadas, informe quem participou e envie uma
              evidência para cada área.
            </p>
          </div>
          <span className="activity-module-arrow">→</span>
        </button>

        <button className="activity-module-card available" type="button" onClick={onOpenAmarracao}>
          <span className="activity-module-icon">🔗</span>
          <div className="activity-module-copy">
            <div className="activity-module-title">
              <h2>Amarração</h2>
              <span>Disponível</span>
            </div>
            <p>
              Lançamento por Mapa/OP com placa do cavalo, segundo ajudante opcional
              e foto obrigatória da evidência.
            </p>
          </div>
          <span className="activity-module-arrow">→</span>
        </button>

        <button className="activity-module-card available" type="button" onClick={onOpenSeloVermelho}>
          <span className="activity-module-icon">🔴</span>
          <div className="activity-module-copy">
            <div className="activity-module-title">
              <h2>Selo Vermelho</h2>
              <span>Disponível</span>
            </div>
            <p>
              Registre a embalagem, quantidade de PLTs, motivo da anomalia e a evidência
              em um único lançamento.
            </p>
          </div>
          <span className="activity-module-arrow">→</span>
        </button>

        <button className="activity-module-card available" type="button" onClick={onOpenSeparacao}>
          <span className="activity-module-icon">📦</span>
          <div className="activity-module-copy">
            <div className="activity-module-title">
              <h2>Separação</h2>
              <span>Disponível</span>
            </div>
            <p>
              Marketing, Despejo, CHOPP, Triagem Repack, Pré-Picking e Separação de Transferência.
            </p>
          </div>
          <span className="activity-module-arrow">→</span>
        </button>

        <button className="activity-module-card available" type="button" onClick={onOpenRetornoRota}>
          <span className="activity-module-icon">↩</span>
          <div className="activity-module-copy">
            <div className="activity-module-title">
              <h2>Retorno de Rota</h2>
              <span>Disponível</span>
            </div>
            <p>Molho AG, Devolução, Troca e Separação de Chapatex com participantes e evidência.</p>
          </div>
          <span className="activity-module-arrow">→</span>
        </button>

        <button className="activity-module-card available" type="button" onClick={onOpenIntegralizacaoDevolucao}>
          <span className="activity-module-icon">↻</span>
          <div className="activity-module-copy">
            <div className="activity-module-title">
              <h2>Integralização da Devolução</h2>
              <span>Disponível</span>
            </div>
            <p>Confirme se a devolução foi integralizada 100%, informe participantes e envie a evidência.</p>
          </div>
          <span className="activity-module-arrow">→</span>
        </button>

        <button className="activity-module-card available" type="button" onClick={onOpenRepack}>
          <span className="activity-module-icon">♻</span>
          <div className="activity-module-copy">
            <div className="activity-module-title">
              <h2>Repack</h2>
              <span>Disponível</span>
            </div>
            <p>Registre SKU recuperado, quantidade de caixas, participantes e evidência.</p>
          </div>
          <span className="activity-module-arrow">→</span>
        </button>
      </div>
    </section>
  )
}

function FiveSForm({ currentUser, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [areaSearch, setAreaSearch] = useState('')
  const [peopleSearch, setPeopleSearch] = useState('')
  const [selectedHelpers, setSelectedHelpers] = useState([])
  const [selectedItems, setSelectedItems] = useState({})
  const [observation, setObservation] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/api/activities/5s')
      setData(response)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const options = data?.opcoes || []
  const users = data?.usuarios || []
  const unitValue = Number(data?.atividade?.valor_unitario || 0)

  const filteredUsers = useMemo(() => {
    const search = peopleSearch.trim().toLowerCase()
    if (!search) return users

    return users.filter((person) =>
      [person.nome, person.turno, person.perfil]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    )
  }, [users, peopleSearch])

  const generalOptions = useMemo(
    () =>
      options.filter(
        (option) =>
          option.grupo !== 'Picking' &&
          option.nome.toLowerCase().includes(areaSearch.trim().toLowerCase()),
      ),
    [options, areaSearch],
  )

  const pickingOptions = useMemo(
    () =>
      options.filter(
        (option) =>
          option.grupo === 'Picking' &&
          option.nome.toLowerCase().includes(areaSearch.trim().toLowerCase()),
      ),
    [options, areaSearch],
  )

  const selectedCount = Object.keys(selectedItems).length
  const individualTotal = selectedCount * unitValue
  const peopleCount = 1 + selectedHelpers.length

  function toggleHelper(id) {
    setSelectedHelpers((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    )
  }

  function toggleArea(option) {
    setSelectedItems((current) => {
      const next = { ...current }

      if (next[option.chave]) {
        delete next[option.chave]
      } else {
        next[option.chave] = {
          opcao_chave: option.chave,
          opcao_nome: option.nome,
          evidencia_foto: '',
        }
      }

      return next
    })
  }

  async function choosePhoto(optionKey, file) {
    if (!file) return

    setError('')

    try {
      const photo = await compressEvidence(file)
      setSelectedItems((current) => ({
        ...current,
        [optionKey]: {
          ...current[optionKey],
          evidencia_foto: photo,
        },
      }))
    } catch (photoError) {
      setError(photoError.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const items = Object.values(selectedItems)

    if (items.length === 0) {
      setError('Selecione pelo menos uma área do 5S.')
      return
    }

    const missingPhoto = items.find((item) => !item.evidencia_foto)
    if (missingPhoto) {
      setError(`Envie uma foto para ${missingPhoto.opcao_nome}.`)
      return
    }

    setSaving(true)

    try {
      const response = await api.post('/api/activities/5s', {
        ajudantes_usuario_ids: selectedHelpers,
        itens: items.map((item) => ({
          opcao_chave: item.opcao_chave,
          evidencia_foto: item.evidencia_foto,
        })),
        observacao: observation,
      })

      setSuccess(response.message || 'Lançamento enviado para aprovação.')
      setSelectedHelpers([])
      setSelectedItems({})
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
    return <div className="activities-loading">Carregando 5S...</div>
  }

  return (
    <section className="activities-page">
      <div className="activity-screen-header">
        <button className="activity-back-button" type="button" onClick={onBack}>←</button>
        <div>
          <span className="dashboard-kicker">ATIVIDADES • 5S</span>
          <h1>Lançamento 5S</h1>
          <p>Um lançamento reúne todas as pessoas, áreas e evidências da mesma atividade.</p>
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
                <h2>Quem participou?</h2>
              </div>
              <span className="activity-panel-count">{peopleCount} pessoa(s)</span>
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
                    className={`activity-person-option ${selected ? 'selected' : ''}`}
                    type="button"
                    key={person.id}
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
                <span className="activity-step">02</span>
                <h2>Áreas realizadas</h2>
              </div>
              <span className="activity-panel-count">{selectedCount} selecionada(s)</span>
            </div>

            <div className="activity-area-search">
              <input
                type="search"
                placeholder="Buscar uma área..."
                value={areaSearch}
                onChange={(event) => setAreaSearch(event.target.value)}
              />
            </div>

            <div className="activity-area-section">
              <div className="activity-area-section-title">
                <strong>Áreas do armazém</strong>
                <small>{money(unitValue)} por área / pessoa</small>
              </div>

              <div className="activity-area-grid">
                {generalOptions.map((option) => {
                  const selected = Boolean(selectedItems[option.chave])

                  return (
                    <button
                      className={`activity-area-option ${selected ? 'selected' : ''}`}
                      type="button"
                      key={option.chave}
                      onClick={() => toggleArea(option)}
                    >
                      <span>{selected ? '✓' : '+'}</span>
                      <strong>{option.nome}</strong>
                    </button>
                  )
                })}
              </div>
            </div>

            {pickingOptions.length > 0 && (
              <div className="activity-area-section">
                <div className="activity-area-section-title">
                  <strong>Picking</strong>
                  <small>Selecione as ruas realizadas</small>
                </div>

                <div className="activity-area-grid compact">
                  {pickingOptions.map((option) => {
                    const selected = Boolean(selectedItems[option.chave])

                    return (
                      <button
                        className={`activity-area-option ${selected ? 'selected' : ''}`}
                        type="button"
                        key={option.chave}
                        onClick={() => toggleArea(option)}
                      >
                        <span>{selected ? '✓' : '+'}</span>
                        <strong>{option.nome.replace('Picking - ', '')}</strong>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {selectedCount > 0 && (
            <section className="activity-panel">
              <div className="activity-panel-heading">
                <div>
                  <span className="activity-step">03</span>
                  <h2>Evidências</h2>
                </div>
                <span className="activity-panel-count">1 foto por área</span>
              </div>

              <div className="activity-evidence-grid">
                {Object.values(selectedItems).map((item) => (
                  <article className="activity-evidence-card" key={item.opcao_chave}>
                    <div className="activity-evidence-head">
                      <strong>{item.opcao_nome}</strong>
                      <button type="button" onClick={() => toggleArea(item)}>Remover</button>
                    </div>

                    {item.evidencia_foto ? (
                      <label className="activity-photo-preview">
                        <img src={item.evidencia_foto} alt={`Evidência de ${item.opcao_nome}`} />
                        <span>Trocar foto</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          onChange={(event) => choosePhoto(item.opcao_chave, event.target.files?.[0])}
                        />
                      </label>
                    ) : (
                      <label className="activity-photo-empty">
                        <span className="activity-photo-camera">▣</span>
                        <strong>Tirar ou anexar foto</strong>
                        <small>JPG, PNG ou WEBP</small>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          onChange={(event) => choosePhoto(item.opcao_chave, event.target.files?.[0])}
                        />
                      </label>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

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
              placeholder="Inclua alguma informação importante sobre o 5S..."
              maxLength={3000}
            />
          </section>
        </div>

        <aside className="activity-summary-card">
          <span className="dashboard-kicker">RESUMO</span>
          <h2>5S de hoje</h2>

          <div className="activity-summary-row">
            <span>Participantes</span>
            <strong>{peopleCount}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Áreas</span>
            <strong>{selectedCount}</strong>
          </div>
          <div className="activity-summary-row">
            <span>Valor por pessoa</span>
            <strong>{money(individualTotal)}</strong>
          </div>
          <div className="activity-summary-row total">
            <span>Total do grupo</span>
            <strong>{money(individualTotal * peopleCount)}</strong>
          </div>

          <p>
            O administrador receberá <strong>um único lançamento</strong> para aprovar,
            mesmo quando houver vários participantes.
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
                  <strong>5S #{item.id}</strong>
                  <small>{formatDate(item.criado_em)}</small>
                </div>
                <span>{item.quantidade_areas} área(s) • {item.quantidade_participantes} pessoa(s)</span>
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

function ApprovalEditModal({ batch, config, onClose, onSaved }) {
  const principal = batch.participantes.find((person) => person.papel === 'principal')
  const [helpers, setHelpers] = useState(
    batch.participantes
      .filter((person) => person.papel !== 'principal')
      .map((person) => person.usuario_id),
  )
  const [items, setItems] = useState(() =>
    Object.fromEntries(batch.itens.map((item) => [item.opcao_chave, { ...item }])),
  )
  const [observation, setObservation] = useState(batch.observacao || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleHelper(id) {
    setHelpers((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  function toggleArea(option) {
    setItems((current) => {
      const next = { ...current }
      if (next[option.chave]) {
        delete next[option.chave]
      } else {
        next[option.chave] = {
          opcao_chave: option.chave,
          opcao_nome: option.nome,
          evidencia_foto: '',
        }
      }
      return next
    })
  }

  async function choosePhoto(key, file) {
    if (!file) return
    setError('')

    try {
      const photo = await compressEvidence(file)
      setItems((current) => ({
        ...current,
        [key]: { ...current[key], evidencia_foto: photo },
      }))
    } catch (photoError) {
      setError(photoError.message)
    }
  }

  async function save() {
    const selected = Object.values(items)

    if (!selected.length) {
      setError('Mantenha pelo menos uma área no lançamento.')
      return
    }

    const missingPhoto = selected.find((item) => !item.evidencia_foto)
    if (missingPhoto) {
      setError(`Envie uma foto para ${missingPhoto.opcao_nome}.`)
      return
    }

    setSaving(true)
    setError('')

    try {
      const response = await api.post('/api/activities/admin', {
        action: 'editar',
        id: batch.id,
        ajudantes_usuario_ids: helpers,
        itens: selected.map((item) => ({
          opcao_chave: item.opcao_chave,
          evidencia_foto: item.evidencia_foto,
        })),
        observacao: observation,
      })
      onSaved(response.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const options = config?.opcoes || []
  const users = (config?.usuarios || []).filter((person) => person.id !== principal?.usuario_id)

  return (
    <div className="activity-modal-backdrop" role="presentation">
      <div className="activity-edit-modal" role="dialog" aria-modal="true">
        <div className="activity-edit-modal-head">
          <div>
            <span className="dashboard-kicker">EDITAR ANTES DE APROVAR</span>
            <h2>5S #{batch.id}</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>

        {error && <div className="activity-message error">{error}</div>}

        <div className="activity-edit-block">
          <label>Responsável principal</label>
          <div className="activity-edit-principal">{principal?.usuario_nome || batch.usuario_criador_nome}</div>
        </div>

        <div className="activity-edit-block">
          <label>Ajudantes</label>
          <div className="activity-edit-users">
            {users.map((person) => (
              <button
                type="button"
                key={person.id}
                className={helpers.includes(person.id) ? 'selected' : ''}
                onClick={() => toggleHelper(person.id)}
              >
                {helpers.includes(person.id) ? '✓ ' : '+ '}
                {person.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="activity-edit-block">
          <label>Áreas</label>
          <div className="activity-edit-areas">
            {options.map((option) => (
              <button
                type="button"
                key={option.chave}
                className={items[option.chave] ? 'selected' : ''}
                onClick={() => toggleArea(option)}
              >
                {items[option.chave] ? '✓ ' : '+ '}
                {option.nome}
              </button>
            ))}
          </div>
        </div>

        {Object.values(items).map((item) => (
          <div className="activity-edit-photo" key={item.opcao_chave}>
            <span>{item.opcao_nome}</span>
            {item.evidencia_foto && <img src={item.evidencia_foto} alt="" />}
            <label>
              {item.evidencia_foto ? 'Trocar foto' : 'Adicionar foto'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => choosePhoto(item.opcao_chave, event.target.files?.[0])}
              />
            </label>
          </div>
        ))}

        <div className="activity-edit-block">
          <label>Observação</label>
          <textarea
            value={observation}
            onChange={(event) => setObservation(event.target.value)}
            maxLength={3000}
          />
        </div>

        <div className="activity-edit-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="primary" onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ApprovalsScreen({ onBack }) {
  const [data, setData] = useState(null)
  const [config, setConfig] = useState(null)
  const [status, setStatus] = useState('pendente')
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [status])

  async function load() {
    setLoading(true)
    setError('')

    try {
      const [approvalData, fiveSConfig] = await Promise.all([
        api.get(`/api/activities/admin?status=${status}`),
        api.get('/api/activities/5s'),
      ])
      setData(approvalData)
      setConfig(fiveSConfig)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function approve(batch) {
    setWorkingId(batch.id)
    setError('')
    setMessage('')

    try {
      const response = await api.post('/api/activities/admin', {
        action: 'aprovar',
        id: batch.id,
      })
      setMessage(response.message)
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setWorkingId(null)
    }
  }

  async function reject(batch) {
    const reason = window.prompt('Motivo da reprovação:')
    if (!reason?.trim()) return

    setWorkingId(batch.id)
    setError('')
    setMessage('')

    try {
      const response = await api.post('/api/activities/admin', {
        action: 'reprovar',
        id: batch.id,
        motivo: reason,
      })
      setMessage(response.message)
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setWorkingId(null)
    }
  }

  const summary = data?.resumo || {}

  return (
    <section className="activities-page">
      <div className="activity-screen-header">
        <button className="activity-back-button" type="button" onClick={onBack}>←</button>
        <div>
          <span className="dashboard-kicker">GESTÃO DE ATIVIDADES</span>
          <h1>Aprovações</h1>
          <p>
            Cada atividade aparece uma única vez. Aprovar ou reprovar aplica a decisão
            a todos os participantes daquele lançamento.
          </p>
        </div>
      </div>

      {error && <div className="activity-message error">{error}</div>}
      {message && <div className="activity-message success">{message}</div>}

      <div className="activity-approval-summary">
        <button className={status === 'pendente' ? 'active' : ''} type="button" onClick={() => setStatus('pendente')}>
          <span>Pendentes</span>
          <strong>{summary.pendentes || 0}</strong>
        </button>
        <button className={status === 'aprovado' ? 'active' : ''} type="button" onClick={() => setStatus('aprovado')}>
          <span>Aprovados</span>
          <strong>{summary.aprovados || 0}</strong>
        </button>
        <button className={status === 'reprovado' ? 'active' : ''} type="button" onClick={() => setStatus('reprovado')}>
          <span>Reprovados</span>
          <strong>{summary.reprovados || 0}</strong>
        </button>
        <button className={status === 'todos' ? 'active' : ''} type="button" onClick={() => setStatus('todos')}>
          <span>Todos</span>
          <strong>{Number(summary.pendentes || 0) + Number(summary.aprovados || 0) + Number(summary.reprovados || 0)}</strong>
        </button>
      </div>

      {loading ? (
        <div className="activities-loading">Carregando aprovações...</div>
      ) : data?.lancamentos?.length ? (
        <div className="activity-approval-list">
          {data.lancamentos.map((batch) => (
            <article className="activity-approval-card" key={batch.id}>
              <div className="activity-approval-top">
                <div>
                  <span className="activity-approval-type">{batch.atividade_nome}</span>
                  <h2>#{batch.id} • {batch.usuario_criador_nome}</h2>
                  <small>{formatDate(batch.criado_em)}</small>
                </div>
                <StatusBadge status={batch.status} />
              </div>

              <div className="activity-approval-metrics">
                <div><span>Participantes</span><strong>{batch.quantidade_participantes}</strong></div>
                <div><span>Áreas</span><strong>{batch.quantidade_areas}</strong></div>
                <div><span>Por pessoa</span><strong>{money(batch.valor_individual)}</strong></div>
                <div><span>Total grupo</span><strong>{money(batch.valor_grupo)}</strong></div>
              </div>

              <div className="activity-approval-section">
                <span>Participantes</span>
                <div className="activity-approval-chips">
                  {batch.participantes.map((person) => (
                    <span key={person.id}>
                      {person.usuario_nome}
                      {person.papel === 'principal' ? ' • principal' : ''}
                    </span>
                  ))}
                </div>
              </div>

              <div className="activity-approval-section">
                <span>Áreas e evidências</span>
                <div className="activity-approval-evidence">
                  {batch.itens.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => item.evidencia_foto && window.open(item.evidencia_foto, '_blank', 'noopener,noreferrer')}
                    >
                      {item.evidencia_foto && <img src={item.evidencia_foto} alt="" />}
                      <strong>{item.opcao_nome}</strong>
                    </button>
                  ))}
                </div>
              </div>

              {batch.observacao && (
                <div className="activity-approval-note">
                  <span>Observação</span>
                  <p>{batch.observacao}</p>
                </div>
              )}

              {batch.motivo_reprovacao && (
                <div className="activity-approval-note rejected">
                  <span>Motivo da reprovação</span>
                  <p>{batch.motivo_reprovacao}</p>
                </div>
              )}

              {batch.status === 'pendente' && (
                <div className="activity-approval-actions">
                  <button type="button" className="edit" onClick={() => setEditing(batch)} disabled={workingId === batch.id}>
                    Editar
                  </button>
                  <button type="button" className="reject" onClick={() => reject(batch)} disabled={workingId === batch.id}>
                    Reprovar
                  </button>
                  <button type="button" className="approve" onClick={() => approve(batch)} disabled={workingId === batch.id}>
                    {workingId === batch.id ? 'Processando...' : 'Aprovar grupo'}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="activity-empty-state">
          <span>✓</span>
          <h2>Nenhuma atividade nesta fila</h2>
          <p>Quando houver lançamentos, eles aparecerão aqui agrupados por atividade.</p>
        </div>
      )}

      {editing && (
        <ApprovalEditModal
          batch={editing}
          config={config}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null)
            setMessage(text)
            await load()
          }}
        />
      )}
    </section>
  )
}

export default function ActivitiesScreen({ currentUser, initialView = 'catalog' }) {
  const [view, setView] = useState(initialView)
  const isAdmin = String(currentUser?.perfil || '').toUpperCase() === 'ADM'

  useEffect(() => {
    setView(initialView)
  }, [initialView])

  if (view === '5s') {
    return <FiveSForm currentUser={currentUser} onBack={() => setView('catalog')} />
  }

  if (view === 'amarracao') {
    return <AmarracaoScreen currentUser={currentUser} onBack={() => setView('catalog')} />
  }

  if (view === 'selo-vermelho') {
    return <SeloVermelhoScreen currentUser={currentUser} onBack={() => setView('catalog')} />
  }

  if (view === 'separacao') {
    return <SeparacaoScreen currentUser={currentUser} onBack={() => setView('catalog')} />
  }

  if (view === 'retorno-rota') {
    return <RetornoRotaScreen currentUser={currentUser} onBack={() => setView('catalog')} />
  }

  if (view === 'integralizacao-devolucao') {
    return <IntegralizacaoDevolucaoScreen currentUser={currentUser} onBack={() => setView('catalog')} />
  }

  if (view === 'repack') {
    return <RepackScreen currentUser={currentUser} onBack={() => setView('catalog')} />
  }

  if (view === 'approvals' && isAdmin) {
    return <ApprovalsScreen onBack={() => setView('catalog')} />
  }

  return (
    <ActivityCatalog
      isAdmin={isAdmin}
      onOpen5s={() => setView('5s')}
      onOpenAmarracao={() => setView('amarracao')}
      onOpenSeloVermelho={() => setView('selo-vermelho')}
      onOpenSeparacao={() => setView('separacao')}
      onOpenRetornoRota={() => setView('retorno-rota')}
      onOpenIntegralizacaoDevolucao={() => setView('integralizacao-devolucao')}
      onOpenRepack={() => setView('repack')}
      onOpenApprovals={() => setView('approvals')}
    />
  )
}
