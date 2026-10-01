import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './services/api.js'
import NewsScreen from './components/NewsScreen.jsx'
import HomeNewsPreview from './components/HomeNewsPreview.jsx'
import UserAvatar from './components/UserAvatar.jsx'
import ProfilePhotoModal, { compressProfilePhoto } from './components/ProfilePhotoModal.jsx'
import WmsSettingsScreen from './components/WmsSettingsScreen.jsx'
import EscalonadaScreen from './components/EscalonadaScreen.jsx'
import EscalonadaAdminScreen from './components/EscalonadaAdminScreen.jsx'
import ActivitiesScreen from './components/ActivitiesScreen.jsx'
import ActivityValuesScreen from './components/ActivityValuesScreen.jsx'
import WalletScreen from './components/WalletScreen.jsx'
import WalletCapsScreen from './components/WalletCapsScreen.jsx'
import HighlightsScreen from './components/HighlightsScreen.jsx'
import ChangePasswordScreen from './components/ChangePasswordScreen.jsx'
import RemunerationAdminScreen from './components/RemunerationAdminScreen.jsx'
import OperatorTasksScreen from './components/OperatorTasksScreen.jsx'
import AccessAnalyticsScreen from './components/AccessAnalyticsScreen.jsx'
import PickingStudioScreen from './components/PickingStudioScreen.jsx'
import './components/DashboardHighlights.css'

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

function formatNotificationDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
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
  const [accessRequestOpen, setAccessRequestOpen] = useState(false)
  const [accessRequest, setAccessRequest] = useState({ cpf: '', turno: '', funcao: '' })
  const [accessRequestLoading, setAccessRequestLoading] = useState(false)
  const [accessRequestMessage, setAccessRequestMessage] = useState('')

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

  async function submitAccessRequest(event) {
    event.preventDefault()
    setError('')
    setAccessRequestMessage('')

    const requestCpf = onlyDigits(accessRequest.cpf)
    if (requestCpf.length !== 11 || !accessRequest.turno || !accessRequest.funcao) {
      setError('Preencha CPF, turno e função para solicitar seu acesso.')
      return
    }

    setAccessRequestLoading(true)
    try {
      const result = await api.post('/api/access-requests', {
        cpf: requestCpf,
        turno: accessRequest.turno,
        funcao: accessRequest.funcao,
      })
      setAccessRequestMessage(result.message)
      setAccessRequest({ cpf: '', turno: '', funcao: '' })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAccessRequestLoading(false)
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
              Sem acesso?{' '}
              <button
                className="login-access-request-link"
                type="button"
                onClick={() => {
                  setError('')
                  setAccessRequestMessage('')
                  setAccessRequestOpen(true)
                }}
              >
                Solicite aqui
              </button>
            </p>
          </div>
        </div>

        {accessRequestOpen && (
          <div className="access-request-backdrop" role="dialog" aria-modal="true">
            <div className="access-request-modal">
              <div className="access-request-head">
                <div>
                  <span className="eyebrow">SOLICITAÇÃO DE ACESSO</span>
                  <h3>Primeiro acesso</h3>
                  <p>Informe seus dados para a liderança liberar seu cadastro.</p>
                </div>
                <button type="button" onClick={() => setAccessRequestOpen(false)}>×</button>
              </div>

              <form className="access-request-form" onSubmit={submitAccessRequest}>
                <label>
                  <span>CPF</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={accessRequest.cpf}
                    onChange={(event) => setAccessRequest((current) => ({ ...current, cpf: formatCpf(event.target.value) }))}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </label>
                <label>
                  <span>Turno</span>
                  <select
                    value={accessRequest.turno}
                    onChange={(event) => setAccessRequest((current) => ({ ...current, turno: event.target.value }))}
                  >
                    <option value="">Selecione</option>
                    <option value="A">Turno A</option>
                    <option value="B">Turno B</option>
                    <option value="C">Turno C</option>
                    <option value="Administrativo">Administrativo</option>
                  </select>
                </label>
                <label>
                  <span>Função</span>
                  <select
                    value={accessRequest.funcao}
                    onChange={(event) => setAccessRequest((current) => ({ ...current, funcao: event.target.value }))}
                  >
                    <option value="">Selecione</option>
                    <option value="Operador">Operador</option>
                    <option value="Ajudante">Ajudante</option>
                    <option value="Conferente">Conferente</option>
                    <option value="Empilhadeira">Empilhadeira</option>
                    <option value="Manobrista">Manobrista</option>
                  </select>
                </label>

                {error && <div className="login-error"><span>!</span>{error}</div>}
                {accessRequestMessage && <div className="access-request-success">{accessRequestMessage}</div>}

                <button className="login-button" type="submit" disabled={accessRequestLoading}>
                  <span>{accessRequestLoading ? 'Enviando...' : 'Solicitar acesso'}</span>
                  {!accessRequestLoading && <span aria-hidden="true">→</span>}
                </button>
              </form>
            </div>
          </div>
        )}

        <footer className="login-footer">
          <span>Ambiente interno</span>
          <span>•</span>
          <span>Acesso monitorado</span>
        </footer>
      </section>
    </main>
  )
}

const SIDEBAR_KEY = 'warehouse_sidebar_collapsed'

function readSidebarPreference() {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

function AppIcon({ name }) {
  const paths = {
    painel: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    armazem: (
      <>
        <path d="M3 10 12 4l9 6v10H3V10Z" />
        <path d="M8 20v-6h8v6M3 10h18" />
      </>
    ),
    news: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M7 8h5M7 11h10M7 14h10M7 17h7" />
      </>
    ),
    rotas: (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h3a4 4 0 0 0 4-4V9M9 6h7" />
      </>
    ),
    devolucoes: (
      <>
        <path d="M9 7H5v-4" />
        <path d="M5 7a8 8 0 1 1-1 8" />
        <path d="M12 8v5l3 2" />
      </>
    ),
    atividades: (
      <>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h5M8 16h7" />
        <path d="m15 12 1.5 1.5L20 10" />
      </>
    ),
    usuarios: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c.4-4 2.4-6 6-6s5.6 2 6 6" />
        <path d="M16 7a3 3 0 0 1 0 6M17 15c2.5.5 3.8 2.2 4 5" />
      </>
    ),
    relatorios: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    escalonada: (
      <>
        <path d="M4 19h16M6 16l4-5 3 3 5-7" />
        <path d="M16 7h2v2" />
      </>
    ),
    carteira: (
      <>
        <path d="M4 7h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h13" />
        <path d="M16 12h5v4h-5a2 2 0 1 1 0-4Z" />
      </>
    ),
    destaques: (
      <>
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
      </>
    ),
    configuracoes: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    sair: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
  }

  return (
    <svg className="app-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name] || paths.painel}
    </svg>
  )
}

function DashboardHome({ usuario, onNavigate }) {
  const firstName = String(usuario.nome || 'Usuário').trim().split(' ')[0]
  const profile = String(usuario.perfil || '').toUpperCase()
  const canUseActivities = profile === 'AJUDANTE' || profile === 'ADM'
  const canUseWallet = ['AJUDANTE', 'ADM', 'OPERADOR'].includes(profile)
  const [dashboardHighlights, setDashboardHighlights] = useState([])

  useEffect(() => {
    let active = true

    api.get('/api/highlights')
      .then((data) => {
        if (!active) return
        const priority = { Operador: 1, Ajudante: 2, Conferente: 3, Manobrista: 4 }
        const rows = [...(data.destaques_painel || [])]
          .sort((a, b) => (priority[a.funcao] || 9) - (priority[b.funcao] || 9))
        setDashboardHighlights(rows)
      })
      .catch(() => {
        if (active) setDashboardHighlights([])
      })

    return () => {
      active = false
    }
  }, [])

  function dashboardPeriodLabel(item) {
    const type = String(item.periodo_tipo || '').toLowerCase()
    if (type === 'dia') return 'Destaque do dia'
    if (type === 'semana') return 'Destaque da semana'
    if (type === 'mes') return 'Destaque do mês'
    return 'Destaque da operação'
  }

  return (
    <>
      <section className="dashboard-overview">
        <div className="dashboard-overview-copy">
          <div className="dashboard-overview-eyebrow">
            <span className="dashboard-kicker">VISÃO GERAL</span>
            <span className="overview-status">
              <span className="hero-status-dot" />
              Operação ativa
            </span>
          </div>

          <h1>Olá, {firstName}.</h1>
          <p>Seu espaço para acompanhar a operação e acessar os módulos do sistema.</p>
        </div>

        <div className="dashboard-overview-info">
          <article className="overview-info-item">
            <span className="overview-info-icon"><AppIcon name="usuarios" /></span>
            <div>
              <small>Perfil</small>
              <strong>{usuario.perfil || 'Usuário'}</strong>
            </div>
          </article>

          <article className="overview-info-item">
            <span className="overview-info-icon"><AppIcon name="armazem" /></span>
            <div>
              <small>Cargo</small>
              <strong>{usuario.cargo || 'Não informado'}</strong>
            </div>
          </article>

          <article className="overview-info-item">
            <span className="overview-info-icon"><AppIcon name="rotas" /></span>
            <div>
              <small>Turno</small>
              <strong>{usuario.turno || 'Não informado'}</strong>
            </div>
          </article>
        </div>
      </section>

      {dashboardHighlights.length > 0 && (
        <section className="dashboard-highlights">
          <div className="dashboard-highlights-head">
            <div>
              <span className="dashboard-kicker">DESTAQUES DA OPERAÇÃO</span>
              <h2>Quem fez a diferença</h2>
              <p>Reconhecimentos escolhidos pela liderança e visíveis para toda a operação.</p>
            </div>
            <button type="button" onClick={() => onNavigate?.('destaques')}>
              Ver todos
            </button>
          </div>

          <div className={`dashboard-highlights-grid count-${Math.min(dashboardHighlights.length, 4)}`}>
            {dashboardHighlights.map((item) => (
              <article className="dashboard-highlight-card" key={item.id}>
                <div className="dashboard-highlight-star">★</div>
                <UserAvatar
                  name={item.nome}
                  photo={item.foto_perfil}
                  className="dashboard-highlight-avatar"
                />
                <span className="dashboard-highlight-role">{item.funcao}</span>
                <h3>{item.nome}</h3>
                <small>{dashboardPeriodLabel(item)}</small>
                <p>{item.motivo}</p>
                <div className="dashboard-highlight-footer">
                  <strong>★ {item.estrelas}</strong>
                  <span>{item.estrelas === 1 ? 'estrela' : 'estrelas'}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <HomeNewsPreview onNavigate={onNavigate} />

      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <span className="dashboard-kicker">COMECE POR AQUI</span>
            <h2>Módulos do sistema</h2>
          </div>
          <span className="section-badge">Estrutura pronta para crescer</span>
        </div>

        <div className="module-grid">
          {[
            ['armazem', 'Armazém', 'Indicadores e rotinas do armazém'],
            ['news', 'Armazém New', 'Notícias, comunicados e reconhecimentos'],
            ['rotas', 'Rotas', 'Acompanhamento das operações de entrega'],
            ['devolucoes', 'Devoluções', 'Controle e análise de devoluções'],
            ...(canUseActivities
              ? [['atividades', 'Atividades', '5S e lançamentos operacionais do armazém']]
              : []),
            ...(canUseWallet
              ? [['carteira', 'Carteira', 'Saldo, teto e extrato da remuneração variável']]
              : []),
            ...(String(usuario.perfil || '').toUpperCase() === 'ADM'
              ? [['usuarios', 'Usuários', 'Perfis, acessos e permissões']]
              : []),
            ...(String(usuario.perfil || '').toUpperCase() === 'ADM'
              ? [['relatorios', 'Relatórios', 'Indicadores e exportações']]
              : []),
            ...(String(usuario.perfil || '').toUpperCase() === 'ADM'
              ? [['configuracoes', 'Configurações', 'Preferências e parâmetros do sistema']]
              : []),
          ].map(([icon, title, text]) => (
            <button className="module-card" type="button" key={title} onClick={() => onNavigate?.(icon)}>
              <span className="module-icon"><AppIcon name={icon} /></span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              <span className="module-arrow">→</span>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}

function UsersScreen({ currentUser }) {
  const emptyForm = {
    nome: '',
    cpf: '',
    matricula: '',
    email: '',
    cargo: '',
    turno: '',
    perfil: 'Operador',
    status: 'ativo',
    senha: '',
    foto_perfil: null,
  }

  const userPhotoInputRef = useRef(null)
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [profileFilter, setProfileFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [defaultPassword, setDefaultPassword] = useState('')
  const [bulkPasswordSaving, setBulkPasswordSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(0)
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [accessRequests, setAccessRequests] = useState([])
  const [selectedAccessRequestId, setSelectedAccessRequestId] = useState(0)

  const profiles = ['ADM', 'Operador', 'Ajudante', 'Conferente']

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    setError('')

    try {
      const [data, requestData] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/access-requests'),
      ])
      setUsuarios(data.usuarios || [])
      setAccessRequests(requestData.solicitacoes || [])
      setSelectedUserIds((current) => current.filter((id) => (data.usuarios || []).some((user) => Number(user.id) === Number(id))))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setEditing(null)
    setSelectedAccessRequestId(0)
    setForm(emptyForm)
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  function openEdit(user) {
    setEditing(user)
    setSelectedAccessRequestId(0)
    setForm({
      nome: user.nome || '',
      cpf: formatCpf(user.cpf || ''),
      matricula: user.matricula || '',
      email: user.email || '',
      cargo: user.cargo || '',
      turno: user.turno || '',
      perfil: user.perfil || 'Operador',
      status: user.status || 'ativo',
      senha: '',
      foto_perfil: user.foto_perfil || null,
    })
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setEditing(null)
    setSelectedAccessRequestId(0)
    setForm(emptyForm)
  }

  function openAccessRequest(request) {
    const funcao = String(request.funcao || '')
    const normalized = funcao.toUpperCase()
    const perfil = ['OPERADOR', 'AJUDANTE', 'CONFERENTE'].includes(normalized)
      ? normalized.charAt(0) + normalized.slice(1).toLowerCase()
      : 'Operador'

    setEditing(null)
    setSelectedAccessRequestId(Number(request.id))
    setForm({
      ...emptyForm,
      cpf: formatCpf(request.cpf || ''),
      turno: request.turno || '',
      cargo: funcao,
      perfil,
    })
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  async function discardAccessRequest(request) {
    if (!window.confirm('Descartar esta solicitação de acesso?')) return
    setError('')
    setSuccess('')
    try {
      const result = await api.patch('/api/access-requests', {
        id: request.id,
        status: 'descartado',
      })
      setSuccess(result.message)
      await loadUsers()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function chooseUserPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    setError('')

    try {
      const photo = await compressProfilePhoto(file)
      updateForm('foto_perfil', photo)
    } catch (photoError) {
      setError(photoError.message)
    }
  }

  async function saveUser(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const payload = {
        ...form,
        cpf: onlyDigits(form.cpf),
      }

      const data = editing
        ? await api.post('/api/users/update', { ...payload, id: editing.id })
        : await api.post('/api/users', payload)

      if (!editing && selectedAccessRequestId) {
        await api.patch('/api/access-requests', {
          id: selectedAccessRequestId,
          status: 'atendido',
        })
      }

      setSuccess(data.message)
      setModalOpen(false)
      setSelectedAccessRequestId(0)
      await loadUsers()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(user) {
    const nextStatus = user.status === 'ativo' ? 'inativo' : 'ativo'
    setError('')
    setSuccess('')

    try {
      const data = await api.post('/api/users/update', {
        id: user.id,
        nome: user.nome,
        cpf: user.cpf,
        matricula: user.matricula || '',
        email: user.email || '',
        cargo: user.cargo || '',
        turno: user.turno || '',
        perfil: user.perfil,
        status: nextStatus,
        senha: '',
      })
      setSuccess(data.message)
      await loadUsers()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function applyDefaultPassword() {
    if (defaultPassword.length < 6) {
      setError('A senha padrão deve ter pelo menos 6 caracteres.')
      return
    }

    if (!window.confirm('Aplicar esta senha padrão para todos os usuários ativos?')) return

    setBulkPasswordSaving(true)
    setError('')
    setSuccess('')

    try {
      const data = await api.post('/api/users/admin-actions', {
        action: 'bulk_password',
        senha: defaultPassword,
      })
      setSuccess(data.message)
      setDefaultPassword('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBulkPasswordSaving(false)
    }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Apagar definitivamente ${user.nome} do cadastro?`)) return

    setDeletingId(user.id)
    setError('')
    setSuccess('')

    try {
      const data = await api.post('/api/users/admin-actions', {
        action: 'delete_user',
        usuario_id: user.id,
      })
      setSuccess(data.message)
      await loadUsers()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDeletingId(0)
    }
  }

  function canDeleteUser(user) {
    return Number(user.id) !== Number(currentUser.id) &&
      String(user.perfil || '').toUpperCase() !== 'ADM'
  }

  function toggleUserSelection(userId) {
    const id = Number(userId)
    setSelectedUserIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function toggleSelectAllVisible() {
    const deletableIds = filteredUsers.filter(canDeleteUser).map((user) => Number(user.id))
    const allSelected = deletableIds.length > 0 && deletableIds.every((id) => selectedUserIds.includes(id))

    setSelectedUserIds((current) => {
      if (allSelected) {
        return current.filter((id) => !deletableIds.includes(id))
      }
      return [...new Set([...current, ...deletableIds])]
    })
  }

  async function deleteSelectedUsers() {
    const selectedUsers = usuarios.filter(
      (user) => selectedUserIds.includes(Number(user.id)) && canDeleteUser(user),
    )

    if (selectedUsers.length === 0) {
      setError('Selecione pelo menos um usuário que possa ser apagado.')
      return
    }

    if (!window.confirm(`Apagar definitivamente ${selectedUsers.length} usuário(s) selecionado(s)? Esta ação não pode ser desfeita.`)) return

    setBulkDeleting(true)
    setError('')
    setSuccess('')

    let deleted = 0
    const failures = []

    for (const user of selectedUsers) {
      try {
        await api.post('/api/users/admin-actions', {
          action: 'delete_user',
          usuario_id: user.id,
        })
        deleted += 1
      } catch (requestError) {
        failures.push(`${user.nome}: ${requestError.message}`)
      }
    }

    await loadUsers()
    setBulkDeleting(false)

    if (deleted > 0) {
      setSuccess(`${deleted} usuário(s) excluído(s) com sucesso.`)
    }
    if (failures.length > 0) {
      setError(`Não foi possível apagar ${failures.length} usuário(s): ${failures.join(' | ')}`)
    }
  }

  const filteredUsers = usuarios.filter((user) => {
    const text = search.trim().toLowerCase()
    const matchesText =
      !text ||
      [user.nome, user.cpf, user.matricula, user.cargo, user.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text))

    const matchesProfile = !profileFilter || user.perfil === profileFilter
    const matchesStatus = !statusFilter || user.status === statusFilter

    return matchesText && matchesProfile && matchesStatus
  })

  const activeCount = usuarios.filter((user) => user.status === 'ativo').length
  const adminCount = usuarios.filter((user) => user.perfil === 'ADM').length

  return (
    <section className="users-page">
      <div className="users-header">
        <div>
          <span className="dashboard-kicker">GESTÃO DE ACESSOS</span>
          <h1>Usuários</h1>
          <p>Cadastre funcionários, edite dados e controle perfis de acesso.</p>
        </div>
        <button className="primary-action-button" type="button" onClick={openNew}>
          <span>+</span>
          Novo funcionário
        </button>
      </div>

      <div className="users-summary">
        <article>
          <span>Total</span>
          <strong>{usuarios.length}</strong>
          <small>funcionários cadastrados</small>
        </article>
        <article>
          <span>Ativos</span>
          <strong>{activeCount}</strong>
          <small>com acesso liberado</small>
        </article>
        <article>
          <span>Administradores</span>
          <strong>{adminCount}</strong>
          <small>perfil geral do sistema</small>
        </article>
      </div>

      {accessRequests.some((item) => item.status === 'pendente') && (
        <section className="access-requests-admin">
          <div className="access-requests-admin-head">
            <div>
              <span className="dashboard-kicker">SOLICITAÇÕES DE ACESSO</span>
              <h2>Aguardando cadastro</h2>
              <p>Funcionários que solicitaram acesso pela tela inicial.</p>
            </div>
            <strong>{accessRequests.filter((item) => item.status === 'pendente').length}</strong>
          </div>
          <div className="access-requests-admin-list">
            {accessRequests.filter((item) => item.status === 'pendente').map((request) => (
              <article key={request.id}>
                <div>
                  <strong>{formatCpf(request.cpf)}</strong>
                  <span>{request.turno} • {request.funcao}</span>
                </div>
                <div className="access-request-admin-actions">
                  <button type="button" onClick={() => openAccessRequest(request)}>Cadastrar</button>
                  <button type="button" className="danger" onClick={() => discardAccessRequest(request)}>Descartar</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="users-default-password">
        <div>
          <span className="dashboard-kicker">SENHA PADRÃO</span>
          <h2>Replicar senha para todos</h2>
          <p>Digite uma senha e aplique em todos os usuários ativos. No próximo acesso eles serão orientados a trocar a senha.</p>
        </div>
        <div className="users-default-password-action">
          <input
            type="password"
            value={defaultPassword}
            onChange={(event) => setDefaultPassword(event.target.value)}
            placeholder="Mínimo de 6 caracteres"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={applyDefaultPassword}
            disabled={bulkPasswordSaving}
          >
            {bulkPasswordSaving ? 'Aplicando...' : 'Aplicar para todos'}
          </button>
        </div>
      </section>

      <div className="users-panel">
        <div className="users-toolbar">
          <div className="users-search">
            <AppIcon name="usuarios" />
            <input
              type="search"
              placeholder="Buscar por nome, CPF, matrícula..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select value={profileFilter} onChange={(event) => setProfileFilter(event.target.value)}>
            <option value="">Todos os perfis</option>
            {profiles.map((profile) => (
              <option value={profile} key={profile}>{profile}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos os status</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
          {selectedUserIds.length > 0 && (
            <button
              type="button"
              className="primary-action-button"
              onClick={deleteSelectedUsers}
              disabled={bulkDeleting}
              style={{ background: '#b42318' }}
            >
              {bulkDeleting ? 'Apagando...' : `Apagar selecionados (${selectedUserIds.length})`}
            </button>
          )}
        </div>

        {error && <div className="users-message error">{error}</div>}
        {success && <div className="users-message success">{success}</div>}

        {loading ? (
          <div className="users-empty">Carregando funcionários...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="users-empty">Nenhum funcionário encontrado.</div>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os usuários visíveis"
                      checked={
                        filteredUsers.filter(canDeleteUser).length > 0 &&
                        filteredUsers.filter(canDeleteUser).every((user) => selectedUserIds.includes(Number(user.id)))
                      }
                      onChange={toggleSelectAllVisible}
                    />
                  </th>
                  <th>Funcionário</th>
                  <th>CPF / Matrícula</th>
                  <th>Cargo / Turno</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td data-label="Selecionar" style={{ textAlign: 'center' }}>
                      {canDeleteUser(user) ? (
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${user.nome}`}
                          checked={selectedUserIds.includes(Number(user.id))}
                          onChange={() => toggleUserSelection(user.id)}
                          disabled={bulkDeleting}
                        />
                      ) : (
                        <span title="Administradores não podem ser apagados por esta ação">—</span>
                      )}
                    </td>
                    <td data-label="Funcionário">
                      <div className="table-user">
                        <UserAvatar
                          name={user.nome}
                          photo={user.foto_perfil}
                          className="table-user-avatar"
                        />
                        <div>
                          <strong>{user.nome}</strong>
                          <small>{user.email || 'Sem e-mail'}</small>
                        </div>
                      </div>
                    </td>
                    <td data-label="CPF / Matrícula">
                      <strong className="table-main-text">{formatCpf(user.cpf)}</strong>
                      <small className="table-subtext">{user.matricula || 'Sem matrícula'}</small>
                    </td>
                    <td data-label="Cargo / Turno">
                      <strong className="table-main-text">{user.cargo || 'Não informado'}</strong>
                      <small className="table-subtext">{user.turno || 'Turno não informado'}</small>
                    </td>
                    <td data-label="Perfil">
                      <span className={`profile-pill profile-${String(user.perfil).toLowerCase()}`}>
                        {user.perfil}
                      </span>
                    </td>
                    <td data-label="Status">
                      <span className={`status-pill ${user.status}`}>
                        <i />
                        {user.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td data-label="Ações">
                      <div className="table-actions">
                        <button type="button" onClick={() => openEdit(user)}>Editar</button>
                        <button
                          type="button"
                          className={user.status === 'ativo' ? 'danger' : 'success'}
                          onClick={() => toggleStatus(user)}
                          disabled={Number(user.id) === Number(currentUser.id)}
                        >
                          {user.status === 'ativo' ? 'Inativar' : 'Ativar'}
                        </button>
                        {String(user.perfil || '').toUpperCase() !== 'ADM' && (
                          <button
                            type="button"
                            className="delete"
                            onClick={() => deleteUser(user)}
                            disabled={deletingId === user.id}
                          >
                            {deletingId === user.id ? 'Apagando...' : 'Apagar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="user-modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <div className="user-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="user-modal-header">
              <div>
                <span className="dashboard-kicker">{editing ? 'EDITAR CADASTRO' : 'NOVO CADASTRO'}</span>
                <h2 id="user-modal-title">{editing ? 'Editar funcionário' : 'Cadastrar funcionário'}</h2>
              </div>
              <button type="button" onClick={closeModal} aria-label="Fechar">×</button>
            </div>

            <form className="user-form" onSubmit={saveUser}>
              <div className="user-photo-editor full">
                <UserAvatar
                  name={form.nome || 'Funcionário'}
                  photo={form.foto_perfil}
                  className="user-photo-editor-avatar"
                />
                <div>
                  <strong>Foto do funcionário</strong>
                  <span>PNG, JPG ou WebP. A imagem será ajustada automaticamente.</span>
                  <div className="user-photo-editor-actions">
                    <button
                      type="button"
                      onClick={() => userPhotoInputRef.current?.click()}
                    >
                      {form.foto_perfil ? 'Trocar foto' : 'Adicionar foto'}
                    </button>
                    {form.foto_perfil && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => updateForm('foto_perfil', null)}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={userPhotoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={chooseUserPhoto}
                />
              </div>

              <div className="form-field full">
                <label htmlFor="user-name">Nome completo</label>
                <input id="user-name" value={form.nome} onChange={(event) => updateForm('nome', event.target.value)} required />
              </div>

              <div className="form-field">
                <label htmlFor="user-cpf">CPF</label>
                <input
                  id="user-cpf"
                  inputMode="numeric"
                  value={form.cpf}
                  onChange={(event) => updateForm('cpf', formatCpf(event.target.value))}
                  maxLength={14}
                  placeholder="000.000.000-00"
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="user-matricula">Matrícula</label>
                <input id="user-matricula" value={form.matricula} onChange={(event) => updateForm('matricula', event.target.value)} placeholder="Opcional" />
              </div>

              <div className="form-field full">
                <label htmlFor="user-email">E-mail</label>
                <input id="user-email" type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="Opcional" />
              </div>

              <div className="form-field">
                <label htmlFor="user-cargo">Cargo</label>
                <input id="user-cargo" value={form.cargo} onChange={(event) => updateForm('cargo', event.target.value)} placeholder="Ex.: Supervisor" />
              </div>

              <div className="form-field">
                <label htmlFor="user-turno">Turno</label>
                <input id="user-turno" value={form.turno} onChange={(event) => updateForm('turno', event.target.value)} placeholder="Ex.: Turno A" />
              </div>

              <div className="form-field">
                <label htmlFor="user-profile">Perfil</label>
                <select id="user-profile" value={form.perfil} onChange={(event) => updateForm('perfil', event.target.value)}>
                  {profiles.map((profile) => (
                    <option value={profile} key={profile}>{profile}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="user-status">Status</label>
                <select id="user-status" value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>

              <div className="form-field full">
                <label htmlFor="user-password">{editing ? 'Nova senha' : 'Senha inicial'}</label>
                <input
                  id="user-password"
                  type="password"
                  autoComplete="new-password"
                  value={form.senha}
                  onChange={(event) => updateForm('senha', event.target.value)}
                  placeholder={editing ? 'Deixe em branco para manter a atual' : 'Mínimo de 6 caracteres'}
                  required={!editing}
                />
                <small>{editing ? 'Preencha somente se quiser redefinir a senha.' : 'O funcionário usará esta senha no primeiro acesso.'}</small>
              </div>

              {error && <div className="users-message error full">{error}</div>}

              <div className="user-form-actions full">
                <button className="modal-secondary" type="button" onClick={closeModal} disabled={saving}>Cancelar</button>
                <button className="primary-action-button" type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar funcionário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

function SectionPlaceholder({ title, description, icon }) {
  return (
    <section className="placeholder-card">
      <span className="placeholder-icon"><AppIcon name={icon} /></span>
      <span className="dashboard-kicker">MÓDULO</span>
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="placeholder-note">
        A estrutura desta seção já está preparada. O conteúdo específico será adicionado nas próximas etapas.
      </div>
    </section>
  )
}

function HomeScreen({ usuario, onLogout, onUserChange }) {
  const [loggingOut, setLoggingOut] = useState(false)
  const [activeSection, setActiveSection] = useState('painel')
  const [collapsed, setCollapsed] = useState(() => readSidebarPreference())
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unreadNews, setUnreadNews] = useState(0)
  const [recentNews, setRecentNews] = useState([])
  const [unreadEscalonada, setUnreadEscalonada] = useState(0)
  const [escalonadaNotifications, setEscalonadaNotifications] = useState([])
  const [unreadActivities, setUnreadActivities] = useState(0)
  const [activityNotifications, setActivityNotifications] = useState([])
  const [myStars, setMyStars] = useState(0)
  const [integrationAlertCount, setIntegrationAlertCount] = useState(0)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [profilePhotoOpen, setProfilePhotoOpen] = useState(false)
  const notificationRef = useRef(null)

  const isAdmin = String(usuario.perfil || '').toUpperCase() === 'ADM'
  const canUseActivities = ['ADM', 'AJUDANTE'].includes(String(usuario.perfil || '').toUpperCase())
  const canUseWallet = ['ADM', 'AJUDANTE', 'OPERADOR'].includes(String(usuario.perfil || '').toUpperCase()) ||
    ['EMPILHADEIRA', 'OPERADOR'].includes(String(usuario.cargo || '').trim().toUpperCase())
  const menuItems = [
    { id: 'painel', label: 'Painel', icon: 'painel' },
    { id: 'news', label: 'Armazém New', icon: 'news' },
    ...(canUseActivities ? [{ id: 'atividades', label: 'Atividades', icon: 'atividades' }] : []),
    ...(canUseWallet ? [{ id: 'carteira', label: 'Carteira', icon: 'carteira' }] : []),
    { id: 'destaques', label: 'Destaques', icon: 'destaques' },
    ...(isAdmin ? [{ id: 'gerenciar-destaques', label: 'Gerenciar destaques', icon: 'destaques' }] : []),
    ...(isAdmin ? [{ id: 'aprovar-atividades', label: 'Aprovar atividades', icon: 'atividades' }] : []),
    ...(isAdmin ? [{ id: 'valores-atividades', label: 'Valores das atividades', icon: 'configuracoes' }] : []),
    ...(isAdmin ? [{ id: 'tetos-carteira', label: 'Tetos da carteira', icon: 'carteira' }] : []),
    ...(isAdmin ? [{ id: 'gestao-remuneracao', label: integrationAlertCount > 0 ? `Gestão remuneração (${integrationAlertCount})` : 'Gestão remuneração', icon: 'relatorios' }] : []),
    ...(isAdmin ? [{ id: 'tarefas-operadores', label: 'Tarefas operadores', icon: 'relatorios' }] : []),
    ...(isAdmin ? [{ id: 'acessos-time', label: 'Acessos do time', icon: 'usuarios' }] : []),
    ...(isAdmin ? [{ id: 'picking-studio', label: 'Picking Studio', icon: 'relatorios' }] : []),
    { id: 'escalonada', label: 'Minha Escalonada', icon: 'escalonada' },
    { id: 'alterar-senha', label: 'Alterar senha', icon: 'configuracoes' },
    ...(isAdmin ? [{ id: 'usuarios', label: 'Usuários', icon: 'usuarios' }] : []),
    ...(isAdmin ? [{ id: 'relatorios', label: 'Relatórios', icon: 'relatorios' }] : []),
  ]

  useEffect(() => {
    let active = true

    async function refreshUnread() {
      try {
        const [newsData, escalonadaData, activitiesData, highlightsData, remunerationAlerts] = await Promise.all([
          api.get('/api/news'),
          api.get('/api/escalonada'),
          canUseActivities ? api.get('/api/activities/notifications') : Promise.resolve({ nao_lidas: 0, notificacoes: [] }),
          api.get('/api/highlights'),
          isAdmin ? api.get('/api/admin/remuneration?mode=alerts') : Promise.resolve({ total_pendencias: 0 }),
        ])
        if (active) {
          setUnreadNews(Number(newsData.nao_lidas || 0))
          setRecentNews((newsData.publicacoes || []).slice(0, 5))
          setUnreadEscalonada(Number(escalonadaData.nao_lidas || 0))
          setEscalonadaNotifications((escalonadaData.notificacoes || []).slice(0, 5))
          setUnreadActivities(Number(activitiesData.nao_lidas || 0))
          setActivityNotifications((activitiesData.notificacoes || []).slice(0, 6))
          setMyStars(Number(highlightsData.minhas_estrelas || 0))
          setIntegrationAlertCount(Number(remunerationAlerts.total_pendencias || 0))
        }
      } catch {
        // A ausência temporária do feed não bloqueia a navegação.
      }
    }

    refreshUnread()
    const timer = window.setInterval(refreshUnread, 60000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!notificationOpen) return undefined

    function closeNotifications(event) {
      if (!notificationRef.current?.contains(event.target)) {
        setNotificationOpen(false)
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setNotificationOpen(false)
      }
    }

    document.addEventListener('mousedown', closeNotifications)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('mousedown', closeNotifications)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [notificationOpen])

  const sectionMap = {
    painel: { title: 'Painel', description: 'Visão geral da operação.', icon: 'painel' },
    armazem: { title: 'Armazém', description: 'Indicadores, controles e rotinas do armazém.', icon: 'armazem' },
    news: { title: 'Armazém New', description: 'Notícias, comunicados e reconhecimentos do armazém.', icon: 'news' },
    rotas: { title: 'Rotas', description: 'Acompanhamento das rotas e entregas.', icon: 'rotas' },
    devolucoes: { title: 'Devoluções', description: 'Gestão e análise das devoluções da operação.', icon: 'devolucoes' },
    atividades: { title: 'Atividades', description: 'Lançamentos operacionais do armazém.', icon: 'atividades' },
    carteira: { title: 'Carteira', description: 'Saldo, teto e extrato da remuneração variável.', icon: 'carteira' },
    destaques: { title: 'Destaques da operação', description: 'Reconhecimentos e estrelas da equipe.', icon: 'destaques' },
    'gerenciar-destaques': { title: 'Gerenciar destaques', description: 'Escolha os destaques da operação e registre o motivo.', icon: 'destaques' },
    escalonada: { title: 'Minha Escalonada', description: 'Seu resultado diário e incentivo acumulado.', icon: 'escalonada' },
    usuarios: { title: 'Usuários', description: 'Cadastros, perfis e permissões de acesso.', icon: 'usuarios' },
    relatorios: { title: 'Relatórios', description: 'Indicadores consolidados e exportações.', icon: 'relatorios' },
    'aprovar-atividades': { title: 'Aprovar atividades', description: 'Fila central para revisar, editar, aprovar ou reprovar lançamentos.', icon: 'atividades' },
    'valores-atividades': { title: 'Valores das atividades', description: 'Configuração dos valores unitários das atividades.', icon: 'configuracoes' },
    'tetos-carteira': { title: 'Tetos da carteira', description: 'Limite mensal individual dos ajudantes.', icon: 'carteira' },
    'gestao-remuneracao': { title: 'Gestão remuneração', description: 'Painel, fechamento, integrações e auditoria.', icon: 'relatorios' },
    'tarefas-operadores': { title: 'Tarefas operadores', description: 'Consulta e atualização manual das tarefas concluídas dos operadores.', icon: 'relatorios' },
    'acessos-time': { title: 'Acessos do time', description: 'Acompanhe o uso diário da ferramenta pela equipe.', icon: 'usuarios' },
    'picking-studio': { title: 'Picking Studio', description: 'Simule o slotting do picking com TC fixa e histórico WMS.', icon: 'relatorios' },
    'alterar-senha': { title: 'Alterar senha', description: 'Atualize sua senha de acesso com segurança.', icon: 'configuracoes' },
    configuracoes: { title: 'Configurações', description: 'Preferências e parâmetros do sistema.', icon: 'configuracoes' },
  }

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    try {
      window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
    } catch {
      // Ignora quando o navegador bloqueia armazenamento local.
    }
  }

  async function markNewsRead() {
    try {
      await api.post('/api/news/read')
      setUnreadNews(0)
    } catch {
      // Mantém a navegação funcionando mesmo se a atualização do indicador falhar.
    }
  }

  async function markActivityRead(id) {
    try {
      await api.post('/api/activities/notifications', id ? { id } : {})
      if (id) {
        setActivityNotifications((current) =>
          current.map((item) => item.id === id ? { ...item, lida_em: new Date().toISOString() } : item),
        )
        setUnreadActivities((current) => Math.max(0, current - 1))
      } else {
        setActivityNotifications((current) =>
          current.map((item) => ({ ...item, lida_em: item.lida_em || new Date().toISOString() })),
        )
        setUnreadActivities(0)
      }
    } catch {
      // A navegação continua mesmo se a leitura não puder ser registrada.
    }
  }

  async function markEscalonadaRead(id) {
    try {
      await api.post('/api/escalonada/read', id ? { id } : {})
      if (id) {
        setEscalonadaNotifications((current) =>
          current.map((item) => item.id === id ? { ...item, lida_em: new Date().toISOString() } : item),
        )
        setUnreadEscalonada((current) => Math.max(0, current - 1))
      } else {
        setEscalonadaNotifications((current) =>
          current.map((item) => ({ ...item, lida_em: item.lida_em || new Date().toISOString() })),
        )
        setUnreadEscalonada(0)
      }
    } catch {
      // A navegação continua mesmo se a leitura não puder ser registrada.
    }
  }

  function navigate(section) {
    setActiveSection(section)
    setMobileOpen(false)
    setNotificationOpen(false)

    if (section === 'news') {
      markNewsRead()
    }

    if (section === 'escalonada') {
      markEscalonadaRead()
    }

    if (section === 'atividades') {
      markActivityRead()
    }
  }

  async function handleLogout() {
    setLoggingOut(true)

    try {
      await api.post('/api/auth/logout')
    } finally {
      onLogout()
      setLoggingOut(false)
    }
  }

  const section = sectionMap[activeSection] || sectionMap.painel
  const totalUnread = unreadNews + unreadEscalonada + unreadActivities

  return (
    <main className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <button
        className={`mobile-backdrop ${mobileOpen ? 'visible' : ''}`}
        type="button"
        aria-label="Fechar menu"
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`app-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon"><WarehouseIcon /></span>
          <div className="sidebar-brand-copy">
            <strong>WAREHOUSE</strong>
            <small>GESTÃO OPERACIONAL</small>
          </div>
        </div>

        <div className="sidebar-user">
          <UserAvatar
            name={usuario.nome}
            photo={usuario.foto_perfil}
            className="user-avatar"
          />
          <div className="sidebar-user-copy">
            <strong>{usuario.nome}</strong>
            <span>{usuario.cargo || 'Colaborador'}</span>
            <small>{usuario.perfil || 'Usuário'}</small>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          <span className="sidebar-section-title">NAVEGAÇÃO</span>
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-link ${activeSection === item.id ? 'active' : ''}`}
              type="button"
              onClick={() => navigate(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-link-icon"><AppIcon name={item.icon} /></span>
              <span className="sidebar-link-label">{item.label}</span>
              {item.id === 'news' && unreadNews > 0 && (
                <span className="sidebar-news-badge">
                  {unreadNews > 9 ? '9+' : unreadNews}
                </span>
              )}
              {item.id === 'destaques' && myStars > 0 && (
                <span className="sidebar-news-badge">★ {myStars}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
{isAdmin && (
          <button
            className={`sidebar-link ${activeSection === 'configuracoes' ? 'active' : ''}`}
            type="button"
            onClick={() => navigate('configuracoes')}
            title={collapsed ? 'Configurações' : undefined}
          >
            <span className="sidebar-link-icon"><AppIcon name="configuracoes" /></span>
            <span className="sidebar-link-label">Configurações</span>
          </button>
          )}

          <button
            className="sidebar-link logout-link"
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            title={collapsed ? 'Sair' : undefined}
          >
            <span className="sidebar-link-icon"><AppIcon name="sair" /></span>
            <span className="sidebar-link-label">{loggingOut ? 'Saindo...' : 'Sair'}</span>
          </button>

          <button
            className="sidebar-collapse-button"
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menu' : 'Ocultar menu'}
          >
            <span className={`collapse-icon ${collapsed ? 'rotated' : ''}`}>
              <AppIcon name="chevron" />
            </span>
            <span className="sidebar-link-label">{collapsed ? 'Expandir' : 'Ocultar menu'}</span>
          </button>
        </div>
      </aside>

      <section className="app-main">
        <header className="app-topbar">
          <button
            className="mobile-menu-button"
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <AppIcon name="menu" />
          </button>
          <div className="topbar-title">
            <span>WAREHOUSE</span>
            <strong>{section.title}</strong>
          </div>
          <div className="topbar-actions">
            <div className="notification-center" ref={notificationRef}>
              <button
                className={`news-notification-button ${totalUnread > 0 ? 'has-news' : ''}`}
                type="button"
                onClick={() => setNotificationOpen((current) => !current)}
                aria-expanded={notificationOpen}
                aria-label={totalUnread > 0 ? `${totalUnread} notificações novas` : 'Abrir notificações'}
                title="Notificações"
              >
                <AppIcon name="bell" />
                {totalUnread > 0 && (
                  <span>{totalUnread > 9 ? '9+' : totalUnread}</span>
                )}
              </button>

              {notificationOpen && (
                <div className="notification-popover">
                  <div className="notification-popover-header">
                    <div>
                      <span className="dashboard-kicker">NOTIFICAÇÕES</span>
                      <strong>
                        {totalUnread > 0
                          ? `${totalUnread} ${totalUnread === 1 ? 'novidade' : 'novidades'} para você`
                          : 'Tudo em dia'}
                      </strong>
                    </div>
                    <span className={`notification-status-dot ${totalUnread > 0 ? 'active' : ''}`} />
                  </div>

                  <div className="notification-popover-body">
                    {activityNotifications.map((item) => (
                      <button
                        className={`notification-item ${!item.lida_em ? 'unread' : ''}`}
                        type="button"
                        key={`activity-${item.id}`}
                        onClick={() => {
                          markActivityRead(item.id)
                          navigate('atividades')
                        }}
                      >
                        <span className="notification-item-icon">
                          {item.tipo === 'reprovado' ? '!' : '✓'}
                        </span>
                        <span className="notification-item-copy">
                          <strong>{item.titulo}</strong>
                          <small>{item.mensagem}</small>
                        </span>
                        {!item.lida_em && <span className="notification-new-dot" />}
                      </button>
                    ))}

                    {escalonadaNotifications.map((item) => (
                      <button
                        className={`notification-item ${!item.lida_em ? 'unread' : ''}`}
                        type="button"
                        key={`esc-${item.id}`}
                        onClick={() => {
                          markEscalonadaRead(item.id)
                          navigate('escalonada')
                        }}
                      >
                        <span className="notification-item-icon">%</span>
                        <span className="notification-item-copy">
                          <strong>{item.titulo}</strong>
                          <small>{item.mensagem}</small>
                        </span>
                        {!item.lida_em && <span className="notification-new-dot" />}
                      </button>
                    ))}

                    {recentNews.length === 0 && escalonadaNotifications.length === 0 && activityNotifications.length === 0 ? (
                      <div className="notification-empty">
                        <span>✓</span>
                        <div>
                          <strong>Nenhuma publicação ainda</strong>
                          <p>Quando houver uma novidade do armazém, ela aparecerá aqui.</p>
                        </div>
                      </div>
                    ) : (
                      recentNews.map((post, index) => (
                        <button
                          className={`notification-item ${index < unreadNews ? 'unread' : ''}`}
                          type="button"
                          key={post.id}
                          onClick={() => navigate('news')}
                        >
                          <span className="notification-item-icon">
                            {post.video_url ? '▶' : post.imagens_data?.length ? '▣' : 'N'}
                          </span>
                          <span className="notification-item-copy">
                            <strong>{post.titulo}</strong>
                            <small>
                              {post.autor?.nome || 'Armazém'}
                              {' • '}
                              {formatNotificationDate(post.criado_em)}
                            </small>
                          </span>
                          {index < unreadNews && <span className="notification-new-dot" />}
                        </button>
                      ))
                    )}
                  </div>

                  <button
                    className="notification-view-all"
                    type="button"
                    onClick={() => navigate('news')}
                  >
                    Abrir Armazém New
                    <span>→</span>
                  </button>
                </div>
              )}
            </div>

            <button
              className="topbar-user topbar-profile-button"
              type="button"
              onClick={() => setProfilePhotoOpen(true)}
              title="Alterar foto de perfil"
            >
              <div>
                <strong>{usuario.nome}</strong>
                <span>{usuario.cargo || usuario.perfil || 'Usuário'}</span>
              </div>
              <UserAvatar
                name={usuario.nome}
                photo={usuario.foto_perfil}
                className="topbar-avatar"
              />
            </button>
          </div>
        </header>

        <div className="app-content">
          {activeSection === 'painel' ? (
            <DashboardHome usuario={usuario} onNavigate={navigate} />
          ) : activeSection === 'usuarios' && isAdmin ? (
            <UsersScreen currentUser={usuario} />
          ) : activeSection === 'news' ? (
            <NewsScreen currentUser={usuario} />
          ) : activeSection === 'atividades' && canUseActivities ? (
            <ActivitiesScreen currentUser={usuario} />
          ) : activeSection === 'aprovar-atividades' && isAdmin ? (
            <ActivitiesScreen currentUser={usuario} initialView="approvals" />
          ) : activeSection === 'valores-atividades' && isAdmin ? (
            <ActivityValuesScreen />
          ) : activeSection === 'tetos-carteira' && isAdmin ? (
            <WalletCapsScreen />
          ) : activeSection === 'carteira' && canUseWallet ? (
            <WalletScreen />
          ) : activeSection === 'gestao-remuneracao' && isAdmin ? (
            <RemunerationAdminScreen />
          ) : activeSection === 'tarefas-operadores' && isAdmin ? (
            <OperatorTasksScreen />
          ) : activeSection === 'acessos-time' && isAdmin ? (
            <AccessAnalyticsScreen />
          ) : activeSection === 'picking-studio' && isAdmin ? (
            <PickingStudioScreen />
          ) : activeSection === 'destaques' ? (
            <HighlightsScreen />
          ) : activeSection === 'gerenciar-destaques' && isAdmin ? (
            <HighlightsScreen adminMode />
          ) : activeSection === 'escalonada' ? (
            <EscalonadaScreen />
          ) : activeSection === 'alterar-senha' ? (
            <ChangePasswordScreen onChanged={() => storeQuickAccess(null)} />
          ) : activeSection === 'relatorios' && isAdmin ? (
            <EscalonadaAdminScreen />
          ) : activeSection === 'configuracoes' && isAdmin ? (
            <WmsSettingsScreen />
          ) : (
            <SectionPlaceholder
              title={section.title}
              description={section.description}
              icon={section.icon}
            />
          )}
        </div>
      </section>

      {profilePhotoOpen && (
        <ProfilePhotoModal
          user={usuario}
          onClose={() => setProfilePhotoOpen(false)}
          onUpdated={(updatedUser) => onUserChange?.(updatedUser)}
        />
      )}
    </main>
  )
}

export default function App() {
  const [loadingSession, setLoadingSession] = useState(true)
  const [usuario, setUsuario] = useState(null)

  useEffect(() => {
    if (!usuario?.id) return

    const key = 'warehouse_access_registered_' + usuario.id

    try {
      if (window.sessionStorage.getItem(key) === '1') return
      window.sessionStorage.setItem(key, '1')
    } catch {
      // Se o navegador bloquear sessionStorage, registra normalmente.
    }

    api.post('/api/analytics/access', { origem: 'app' }).catch(() => {
      // Métrica de acesso nunca deve bloquear o uso do sistema.
    })
  }, [usuario?.id])

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
    return (
      <HomeScreen
        usuario={usuario}
        onLogout={() => setUsuario(null)}
        onUserChange={setUsuario}
      />
    )
  }

  return <LoginScreen onLogin={setUsuario} />
}