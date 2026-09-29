import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function statusLabel(value) {
  if (value === 'ok') return 'Conexão validada'
  if (value === 'error' || value === 'erro') return 'Atenção necessária'
  return 'Ainda não testado'
}

export default function WmsSettingsScreen() {
  const [data, setData] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const configured = Boolean(data?.credentials?.configured)
  const connectionStatus = data?.integration?.status || 'unknown'
  const latest = data?.latestCollection

  const statusClass = useMemo(() => {
    if (connectionStatus === 'ok') return 'success'
    if (connectionStatus === 'error') return 'error'
    return 'neutral'
  }, [connectionStatus])

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/api/wms/settings')
      setData(response)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveCredentials(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')

    try {
      const response = await api.post('/api/wms/settings', {
        username,
        password,
      })

      setUsername('')
      setPassword('')
      setMessage(response.message)
      await loadSettings()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function testConnection() {
    setTesting(true)
    setMessage('')
    setError('')

    try {
      const response = await api.post('/api/wms/test')
      setMessage(`${response.message} ${response.count} registros disponíveis hoje.`)
      await loadSettings()
    } catch (requestError) {
      setError(requestError.message)
      await loadSettings()
    } finally {
      setTesting(false)
    }
  }

  async function collectNow() {
    setCollecting(true)
    setMessage('')
    setError('')

    try {
      const response = await api.post('/api/wms/collect')
      setMessage(response.message)
      await loadSettings()
    } catch (requestError) {
      setError(requestError.message)
      await loadSettings()
    } finally {
      setCollecting(false)
    }
  }

  if (loading) {
    return (
      <section className="wms-settings-page">
        <div className="wms-loading-card">Carregando integração WMS...</div>
      </section>
    )
  }

  return (
    <section className="wms-settings-page">
      <header className="wms-settings-header">
        <div>
          <span className="dashboard-kicker">CONFIGURAÇÕES • ADM</span>
          <h1>Gestão WMS</h1>
          <p>
            Credenciais protegidas para a coleta automática do Relatório de Rateio.
          </p>
        </div>

        <div className={`wms-status-pill ${statusClass}`}>
          <span />
          {statusLabel(connectionStatus)}
        </div>
      </header>

      {(message || error) && (
        <div className={`wms-message ${error ? 'error' : 'success'}`}>
          {error || message}
        </div>
      )}

      <div className="wms-settings-grid">
        <article className="wms-settings-card credentials-card">
          <div className="wms-card-heading">
            <div>
              <span className="wms-card-icon">⌁</span>
              <div>
                <small>ACESSO AO WMS</small>
                <h2>Credenciais</h2>
              </div>
            </div>
            <span className={`wms-mini-badge ${configured ? 'success' : ''}`}>
              {configured ? 'Configurado' : 'Pendente'}
            </span>
          </div>

          {configured && (
            <div className="wms-current-credential">
              <span>Login salvo</span>
              <strong>{data.credentials.maskedUsername}</strong>
              <small>
                Atualizado em {formatDate(data.credentials.updatedAt)}
              </small>
            </div>
          )}

          <form className="wms-credentials-form" onSubmit={saveCredentials}>
            <div className="form-field">
              <label htmlFor="wms-user">
                {configured ? 'Novo login WMS' : 'Login WMS'}
              </label>
              <input
                id="wms-user"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
                placeholder="Digite o usuário do WMS"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="wms-password">
                {configured ? 'Nova senha WMS' : 'Senha WMS'}
              </label>
              <input
                id="wms-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Digite a senha do WMS"
                required
              />
              <small>
                A senha nunca volta para o navegador depois de salva.
              </small>
            </div>

            <button
              className="primary-action-button wms-save-button"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Salvando...' : configured ? 'Atualizar credenciais' : 'Salvar credenciais'}
            </button>
          </form>
        </article>

        <article className="wms-settings-card status-card">
          <div className="wms-card-heading">
            <div>
              <span className="wms-card-icon">✓</span>
              <div>
                <small>INTEGRAÇÃO</small>
                <h2>Status da conexão</h2>
              </div>
            </div>
          </div>

          <div className="wms-status-panel">
            <span className={`wms-status-light ${statusClass}`} />
            <div>
              <strong>{statusLabel(connectionStatus)}</strong>
              <p>
                {data?.integration?.message ||
                  'Salve as credenciais e faça o primeiro teste de conexão.'}
              </p>
            </div>
          </div>

          <div className="wms-status-details">
            <div>
              <small>Última validação</small>
              <strong>{formatDate(data?.integration?.checkedAt)}</strong>
            </div>
            <div>
              <small>Registros no teste</small>
              <strong>{Number(data?.integration?.count || 0)}</strong>
            </div>
          </div>

          <button
            className="wms-secondary-button"
            type="button"
            onClick={testConnection}
            disabled={!configured || testing}
          >
            {testing ? 'Testando conexão...' : 'Testar conexão WMS'}
          </button>
        </article>

        <article className="wms-settings-card collection-card">
          <div className="wms-card-heading">
            <div>
              <span className="wms-card-icon">09</span>
              <div>
                <small>COLETA AUTOMÁTICA</small>
                <h2>Relatório de Rateio</h2>
              </div>
            </div>
            <span className="wms-mini-badge">09:00</span>
          </div>

          <p className="wms-card-description">
            Em produção, a coleta será executada diariamente às 09:00 de Salvador
            e gravará a fotografia da pontuação do dia atual.
          </p>

          <div className="wms-collection-summary">
            <div>
              <small>Última coleta</small>
              <strong>{formatDate(latest?.coletado_em)}</strong>
            </div>
            <div>
              <small>Data do relatório</small>
              <strong>{latest?.data_ref ? String(latest.data_ref).slice(0, 10).split('-').reverse().join('/') : '—'}</strong>
            </div>
            <div>
              <small>Registros</small>
              <strong>{Number(latest?.total_registros || 0)}</strong>
            </div>
          </div>

          {latest?.status === 'erro' && (
            <div className="wms-collection-error">
              {latest.erro || 'A última coleta encontrou um erro.'}
            </div>
          )}

          <button
            className="wms-secondary-button"
            type="button"
            onClick={collectNow}
            disabled={!configured || collecting}
          >
            {collecting ? 'Coletando...' : 'Executar coleta agora'}
          </button>
        </article>

        <aside className="wms-security-note">
          <strong>Como a proteção funciona</strong>
          <p>
            Login e senha são criptografados no backend com AES-256-GCM. A chave
            fica fora do banco e do GitHub. O navegador nunca recebe a senha salva.
          </p>
        </aside>
      </div>
    </section>
  )
}
