import { useEffect, useMemo, useState } from 'react'
import { api } from './services/api.js'

const QUICK_ACCESS_KEY = 'warehouse_quick_access'

function readQuickAccess() {
  try {
    const value = window.localStorage.getItem(QUICK_ACCESS_KEY)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function storeQuickAccess(value) {
  try {
    if (value) {
      window.localStorage.setItem(QUICK_ACCESS_KEY, JSON.stringify(value))
    } else {
      window.localStorage.removeItem(QUICK_ACCESS_KEY)
    }
  } catch {
    // O navegador pode bloquear armazenamento local em alguns modos privados.
  }
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 11)
}

function formatCpf(value) {
  const digits = onlyDigits(value)

  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

function WarehouseIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M7 26 32 10l25 16v28H7V26Z" />
      <path d="M17 31h30v23H17V31Z" />
      <path d="M21 36h8v7h-8v-7Zm14 0h8v7h-8v-7ZM21 47h8v7h-8v-7Zm14 0h8v7h-8v-7Z" />
      <path d="M5 26h54M32 10v10" />
    </svg>
  )
}

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3 21 21" />
      <path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3 3.8M6.6 6.6C3.6 8.4 2 12 2 12s3.5 6 10 6a10.2 10.2 0 0 0 4-.8" />
      <path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" />
    </svg>
  )
}

function LoginScreen({ onLogin }) {
  const [cpf, setCpf] = useState('')
  const [senha, setSenha] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [quickAccess, setQuickAccess] = useState(() => readQuickAccess())

  const cpfValido = useMemo(() => onlyDigits(cpf).length === 11, [cpf])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!cpfValido || senha.length === 0) {
      setError('Informe um CPF válido e sua senha.')
      return
    }

    setLoading(true)

    try {
      const data = await api.post('/api/auth/login', {
        cpf: onlyDigits(cpf),
        senha,
      })

      if (data.quickAccess?.token) {
        const remembered = {
          token: data.quickAccess.token,
          nome: data.quickAccess.nome,
          cpf: data.quickAccess.cpf,
        }
        storeQuickAccess(remembered)
        setQuickAccess(remembered)
      }

      onLogin(data.usuario)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleQuickLogin() {
    if (!quickAccess?.token) {
      return
    }

    setError('')
    setLoading(true)

    try {
      const data = await api.post('/api/auth/quick-login', {
        token: quickAccess.token,
      })

      onLogin(data.usuario)
    } catch (requestError) {
      storeQuickAccess(null)
      setQuickAccess(null)
      setError(
        requestError.status === 401
          ? 'O acesso rápido expirou. Entre novamente com CPF e senha.'
          : requestError.message,
      )
    } finally {
      setLoading(false)
    }
  }

  function forgetQuickAccess() {
    storeQuickAccess(null)
    setQuickAccess(null)
    setError('')
  }

  return (
    <main className="login-page">
      <section className="warehouse-panel" aria-label="Ambiente de armazém">
        <div className="panel-overlay" />

        <div className="brand-mark">
          <span className="brand-icon">
            <WarehouseIcon />
          </span>
          <div>
            <strong>WAREHOUSE</strong>
            <small>GESTÃO OPERACIONAL</small>
          </div>
        </div>

        <div className="warehouse-copy">
          <span className="section-tag">OPERAÇÃO • CONTROLE • RESULTADO</span>
          <h1>
            O armazém começa
            <br />
            com informação.
          </h1>
          <p>
            Um ambiente central para acompanhar a operação, organizar processos
            e transformar rotina em resultado.
          </p>
        </div>

        <div className="warehouse-stats" aria-hidden="true">
          <div>
            <span>01</span>
            <small>ACESSO SEGURO</small>
          </div>
          <div>
            <span>24h</span>
            <small>OPERAÇÃO</small>
          </div>
          <div>
            <span>100%</span>
            <small>FOCO</small>
          </div>
        </div>

        <div className="rack rack-one" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="rack rack-two" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="forklift" aria-hidden="true">
          <div className="forklift-body" />
          <div className="forklift-cabin" />
          <div className="forklift-mast" />
          <div className="forklift-fork" />
          <i />
          <i />
        </div>
      </section>

      <section className="login-panel">
        <div className="mobile-brand">
          <span className="brand-icon">
            <WarehouseIcon />
          </span>
          <div>
            <strong>WAREHOUSE</strong>
            <small>GESTÃO OPERACIONAL</small>
          </div>
        </div>

        <div className="login-card">
          <div className="login-heading">
            <span className="eyebrow">BEM-VINDO</span>
            <h2>Acesse sua conta</h2>
            <p>Entre com seu CPF e senha para continuar.</p>
          </div>

          {quickAccess && (
            <div className="quick-access-card">
              <div className="quick-access-avatar" aria-hidden="true">
                {String(quickAccess.nome || 'U').trim().charAt(0).toUpperCase()}
              </div>
              <div className="quick-access-copy">
                <span>Acesso rápido</span>
                <strong>{quickAccess.nome || 'Usuário'}</strong>
                <small>{quickAccess.cpf || 'Dispositivo reconhecido'}</small>
              </div>
              <button
                className="quick-access-button"
                type="button"
                onClick={handleQuickLogin}
                disabled={loading}
              >
                {loading ? 'Entrando...' : 'Acessar'}
              </button>
              <button
                className="quick-access-forget"
                type="button"
                onClick={forgetQuickAccess}
                disabled={loading}
                aria-label="Remover acesso rápido deste navegador"
              >
                ×
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <label className="field-label" htmlFor="cpf">
              CPF
            </label>
            <div className="input-wrap">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c.7-4.5 3.4-7 8-7s7.3 2.5 8 7" />
                </svg>
              </span>
              <input
                id="cpf"
                name="cpf"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(event) => setCpf(formatCpf(event.target.value))}
                maxLength={14}
                disabled={loading}
              />
            </div>

            <div className="password-row">
              <label className="field-label" htmlFor="senha">
                Senha
              </label>
            </div>

            <div className="input-wrap">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="5" y="10" width="14" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
              </span>
              <input
                id="senha"
                name="senha"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                disabled={loading}
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                disabled={loading}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>

            {error && (
              <div className="login-error" role="alert">
                <span>!</span>
                {error}
              </div>
            )}

            <button className="login-button" type="submit" disabled={loading}>
              <span>{loading ? 'Entrando...' : 'Entrar no sistema'}</span>
              {!loading && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <div className="login-support">
            <span className="support-dot" />
            <p>
              Problemas para acessar? <strong>Procure seu responsável.</strong>
            </p>
          </div>
        </div>

        <footer className="login-footer">
          <span>Ambiente interno</span>
          <span>•</span>
          <span>Acesso monitorado</span>
        </footer>
      </section>
    </main>
  )
}

function HomeScreen({ usuario, onLogout }) {
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)

    try {
      await api.post('/api/auth/logout')
    } finally {
      onLogout()
      setLoggingOut(false)
    }
  }

  return (
    <main className="authenticated-page">
      <section className="welcome-card">
        <span className="brand-icon large">
          <WarehouseIcon />
        </span>
        <span className="eyebrow">ACESSO LIBERADO</span>
        <h1>Olá, {usuario.nome}.</h1>
        <p>
          Seu login foi validado. A estrutura de autenticação do sistema já está
          funcionando.
        </p>
        <div className="user-summary">
          <div>
            <span>Perfil</span>
            <strong>{usuario.perfil}</strong>
          </div>
          <div>
            <span>Cargo</span>
            <strong>{usuario.cargo || 'Não informado'}</strong>
          </div>
          <div>
            <span>Turno</span>
            <strong>{usuario.turno || 'Não informado'}</strong>
          </div>
        </div>
        <button className="secondary-button" type="button" onClick={handleLogout}>
          {loggingOut ? 'Saindo...' : 'Sair'}
        </button>
      </section>
    </main>
  )
}

export default function App() {
  const [loadingSession, setLoadingSession] = useState(true)
  const [usuario, setUsuario] = useState(null)

  useEffect(() => {
    let active = true

    api
      .get('/api/auth/me')
      .then((data) => {
        if (active) {
          setUsuario(data.usuario)
        }
      })
      .catch(() => {
        if (active) {
          setUsuario(null)
        }
      })
      .finally(() => {
        if (active) {
          setLoadingSession(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  if (loadingSession) {
    return (
      <main className="session-loader">
        <span className="loader-mark">
          <WarehouseIcon />
        </span>
        <p>Carregando ambiente...</p>
      </main>
    )
  }

  if (usuario) {
    return <HomeScreen usuario={usuario} onLogout={() => setUsuario(null)} />
  }

  return <LoginScreen onLogin={setUsuario} />
}
