import { useEffect, useMemo, useState } from 'react'
import { api } from './services/api.js'
import NewsScreen from './components/NewsScreen.jsx'

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
    configuracoes: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
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

  return (
    <>
      <section className="dashboard-hero">
        <div>
          <span className="dashboard-kicker">VISÃO GERAL</span>
          <h1>Olá, {firstName}.</h1>
          <p>Seu espaço central para acompanhar a operação e acessar os módulos do sistema.</p>
        </div>
        <div className="hero-status">
          <span className="hero-status-dot" />
          <div>
            <small>AMBIENTE</small>
            <strong>Operacional</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-cards">
        <article className="metric-card">
          <span className="metric-label">Perfil</span>
          <strong>{usuario.perfil || 'Usuário'}</strong>
          <small>Nível de acesso atual</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">Cargo</span>
          <strong>{usuario.cargo || 'Não informado'}</strong>
          <small>Função cadastrada</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">Turno</span>
          <strong>{usuario.turno || 'Não informado'}</strong>
          <small>Jornada operacional</small>
        </article>
      </section>

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
            ...(String(usuario.perfil || '').toUpperCase() === 'ADM'
              ? [['usuarios', 'Usuários', 'Perfis, acessos e permissões']]
              : []),
            ['relatorios', 'Relatórios', 'Indicadores e exportações'],
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
  }

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

  const profiles = ['ADM', 'Operador', 'Ajudante', 'Conferente']

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    setError('')

    try {
      const data = await api.get('/api/users')
      setUsuarios(data.usuarios || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  function openEdit(user) {
    setEditing(user)
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
    })
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
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

      setSuccess(data.message)
      setModalOpen(false)
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
                    <td data-label="Funcionário">
                      <div className="table-user">
                        <span>{String(user.nome || 'U').charAt(0).toUpperCase()}</span>
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

function HomeScreen({ usuario, onLogout }) {
  const [loggingOut, setLoggingOut] = useState(false)
  const [activeSection, setActiveSection] = useState('painel')
  const [collapsed, setCollapsed] = useState(() => readSidebarPreference())
  const [mobileOpen, setMobileOpen] = useState(false)

  const isAdmin = String(usuario.perfil || '').toUpperCase() === 'ADM'
  const menuItems = [
    { id: 'painel', label: 'Painel', icon: 'painel' },
    { id: 'armazem', label: 'Armazém', icon: 'armazem' },
    { id: 'news', label: 'Armazém New', icon: 'news' },
    { id: 'rotas', label: 'Rotas', icon: 'rotas' },
    { id: 'devolucoes', label: 'Devoluções', icon: 'devolucoes' },
    ...(isAdmin ? [{ id: 'usuarios', label: 'Usuários', icon: 'usuarios' }] : []),
    { id: 'relatorios', label: 'Relatórios', icon: 'relatorios' },
  ]

  const sectionMap = {
    painel: { title: 'Painel', description: 'Visão geral da operação.', icon: 'painel' },
    armazem: { title: 'Armazém', description: 'Indicadores, controles e rotinas do armazém.', icon: 'armazem' },
    news: { title: 'Armazém New', description: 'Notícias, comunicados e reconhecimentos do armazém.', icon: 'news' },
    rotas: { title: 'Rotas', description: 'Acompanhamento das rotas e entregas.', icon: 'rotas' },
    devolucoes: { title: 'Devoluções', description: 'Gestão e análise das devoluções da operação.', icon: 'devolucoes' },
    usuarios: { title: 'Usuários', description: 'Cadastros, perfis e permissões de acesso.', icon: 'usuarios' },
    relatorios: { title: 'Relatórios', description: 'Indicadores consolidados e exportações.', icon: 'relatorios' },
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

  function navigate(section) {
    setActiveSection(section)
    setMobileOpen(false)
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
  const initial = String(usuario.nome || 'U').trim().charAt(0).toUpperCase()

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
          <div className="user-avatar" aria-label={`Usuário ${usuario.nome}`}>
            {initial}
          </div>
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
          <div className="topbar-user">
            <div>
              <strong>{usuario.nome}</strong>
              <span>{usuario.cargo || usuario.perfil || 'Usuário'}</span>
            </div>
            <span className="topbar-avatar">{initial}</span>
          </div>
        </header>

        <div className="app-content">
          {activeSection === 'painel' ? (
            <DashboardHome usuario={usuario} onNavigate={navigate} />
          ) : activeSection === 'usuarios' && isAdmin ? (
            <UsersScreen currentUser={usuario} />
          ) : activeSection === 'news' ? (
            <NewsScreen currentUser={usuario} />
          ) : (
            <SectionPlaceholder
              title={section.title}
              description={section.description}
              icon={section.icon}
            />
          )}
        </div>
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
