import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import './CartaControleTma.css'

const STATUS = {
  pending: { label: 'Em atendimento', cls: 'pending' },
  late: { label: 'Acima da meta', cls: 'late' },
  good: { label: 'Dentro da meta', cls: 'good' },
}
const PAGE_SIZES = [10, 25, 50]
const COLUMNS = [
  ['placa', 'Placa / carreta'], ['documento', 'Documento'], ['categoria', 'Categoria'],
  ['turno', 'Turno'], ['transportadora', 'Transportadora'], ['motorista', 'Motorista'],
  ['efaSegundos', 'EFA'], ['tmaSegundos', 'TMA'], ['status', 'Status'], ['justificativa', 'Justificativa'],
]

function todayBahia() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const p = Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]))
  return p.year + '-' + p.month + '-' + p.day
}
function duration(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  const n = Math.round(Number(value))
  return [Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60]
    .map(x => String(x).padStart(2, '0')).join(':')
}
function statusFor(row) {
  return row.emAtendimento ? STATUS.pending : row.acimaMeta ? STATUS.late : STATUS.good
}
function formatTimestamp(value) {
  if (!value) return 'Ainda não disponível'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 'Não disponível' : new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Bahia', dateStyle: 'short', timeStyle: 'short',
  }).format(d)
}
function Card({ title, value, hint, variant = 'neutral', icon }) {
  return <article className={'logan-kpi logan-kpi-' + variant}>
    <div className="logan-kpi-top"><span>{title}</span><span className="logan-kpi-icon" aria-hidden="true">{icon}</span></div>
    <strong className="logan-num">{value}</strong>
    {hint && <small>{hint}</small>}
  </article>
}
function JustificativaModal({ linha, onClose, onSaved }) {
  const [texto, setTexto] = useState(linha.justificativa || '')
  const [historico, setHistorico] = useState([])
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    api.get('/api/logan/justificativas?' + new URLSearchParams({ documento: linha.documento }))
      .then(data => {
        if (active) { setHistorico(data.historico || []); setTexto(data.atual?.justificativa || '') }
      })
      .catch(error => { if (active) setErro(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [linha.documento])
  useEffect(() => {
    function escapeClose(e) { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', escapeClose)
    return () => document.removeEventListener('keydown', escapeClose)
  }, [onClose, saving])
  async function save(e) {
    e.preventDefault()
    if (saving) return
    setErro('')
    setSaving(true)
    try {
      await api.post('/api/logan/justificativas', { documento: linha.documento, justificativa: texto.trim() })
      onSaved()
    } catch (error) { setErro(error.message) }
    finally { setSaving(false) }
  }
  return <div className="logan-modal-backdrop" onMouseDown={e => {
    if (e.target === e.currentTarget && !saving) onClose()
  }}>
    <section className="logan-modal" role="dialog" aria-modal="true" aria-label="Justificativa de TMA">
      <header className="logan-modal-header">
        <div><span className="logan-eyebrow">AUDITORIA OPERACIONAL</span><h2>Justificativa do TMA</h2></div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar janela">×</button>
      </header>
      <div className="logan-modal-body">
        <div className="logan-modal-summary">
          <div><span>Documento de transporte</span><strong>{linha.documento}</strong></div>
          <div><span>Tempo médio de atendimento</span><strong className="logan-text-danger">{duration(linha.tmaSegundos)}</strong></div>
        </div>
        <form onSubmit={save} className="logan-modal-form">
          <label htmlFor="logan-justificativa-texto">Justificativa da perda de meta</label>
          <textarea id="logan-justificativa-texto" rows={5} minLength={5} maxLength={3000}
            value={texto} onChange={e => setTexto(e.target.value)} disabled={loading || saving}
            placeholder="Descreva o motivo do atendimento acima de 2 horas…" required />
          <div className="logan-form-footer">
            <span>{texto.length} / 3000 caracteres</span>
            <button type="submit" disabled={loading || saving || texto.trim().length < 5}>
              {saving ? 'Salvando…' : linha.justificativa ? 'Salvar alteração' : 'Registrar justificativa'}
            </button>
          </div>
        </form>
        {erro && <div role="alert" className="logan-alert logan-alert-error">{erro}</div>}
        <div className="logan-history-title"><h3>Histórico de alterações</h3><span>{historico.length} registro(s)</span></div>
        {loading ? <p className="logan-muted">Carregando histórico…</p> : historico.length
          ? <ol className="logan-history">{historico.map((item, i) => <li key={i}>
              <div className="logan-history-meta">
                <strong>{item.tipo_evento === 'EDICAO' ? 'Edição' : 'Criação'}</strong>
                <span>{item.usuario_nome || 'Usuário não identificado'}</span>
                <time>{formatTimestamp(item.criado_em)}</time>
              </div>
              <p>{item.justificativa}</p>
            </li>)}</ol>
          : <p className="logan-empty-history">Nenhuma alteração registrada para este documento.</p>}
      </div>
    </section>
  </div>
}
function OperationRow({ row, onJustify }) {
  const status = statusFor(row)
  return <tr className={'logan-operation-row logan-row-' + status.cls}>
    <td data-label="Placa / carreta"><div className="logan-vehicle">
      <strong>{row.placa || '—'}</strong>{row.carreta && <small>{row.carreta}</small>}
    </div></td>
    <td data-label="Documento" className="logan-mono">{row.documento || '—'}</td>
    <td data-label="Categoria"><span className={'logan-category ' + (row.categoria === 'Frota Fixa' ? 'fixed' : 'spot')}>{row.categoria}</span></td>
    <td data-label="Turno"><span className="logan-shift">{row.turno}</span></td>
    <td data-label="Transportadora">{row.transportadora || '—'}</td>
    <td data-label="Motorista" className="logan-driver">{row.motorista || '—'}</td>
    <td data-label="EFA" className="logan-mono">{duration(row.efaSegundos)}</td>
    <td data-label="TMA" className={'logan-mono ' + (row.acimaMeta ? 'logan-text-danger' : '')}>{duration(row.tmaSegundos)}</td>
    <td data-label="Status"><span className={'logan-status logan-status-' + status.cls}><i />{status.label}</span></td>
    <td data-label="Justificativa" className="logan-justify-cell">{row.acimaMeta
      ? <button className={'logan-action ' + (row.justificativa ? 'has-note' : '')} type="button" onClick={() => onJustify(row)}>
          {row.justificativa ? 'Ver / editar' : 'Justificar'}
        </button>
      : <span className="logan-subtle">—</span>}
    </td>
  </tr>
}
function sortValue(row, col) {
  if (col === 'status') return row.emAtendimento ? 0 : row.acimaMeta ? 2 : 1
  return row[col] ?? null
}
function compareValues(a, b) {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' })
}
export default function CartaControleTma() {
  const [inicio, setInicio] = useState(todayBahia)
  const [fim, setFim] = useState(todayBahia)
  const [turno, setTurno] = useState('')
  const [data, setData] = useState(null)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [selecionado, setSelecionado] = useState(null)
  const [busca, setBusca] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [sort, setSort] = useState({ key: 'tmaSegundos', desc: true })
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(10)

  useEffect(() => {
    let active = true
    setLoading(true)
    setErro('')
    api.get('/api/logan/carta?' + new URLSearchParams({ inicio, fim, turno }))
      .then(result => { if (active) setData(result) })
      .catch(error => { if (active) { setErro(error.message); setData(null) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [inicio, fim, turno, revision])

  useEffect(() => { setPagina(1) }, [inicio, fim, turno, busca, statusFilter, porPagina])
  const filtered = useMemo(() => {
    const rows = data?.detalhes || []
    const q = busca.trim().toLocaleLowerCase('pt-BR')
    return rows.filter(row => {
      if (statusFilter === 'late' && !row.acimaMeta) return false
      if (statusFilter === 'pending' && !row.emAtendimento) return false
      if (statusFilter === 'good' && (row.acimaMeta || row.emAtendimento)) return false
      if (statusFilter === 'no-note' && (!row.acimaMeta || !!row.justificativa)) return false
      if (!q) return true
      return [row.placa, row.carreta, row.documento, row.transportadora, row.motorista, row.categoria]
        .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(q))
    }).sort((left, right) => {
      const a = sortValue(left, sort.key)
      const b = sortValue(right, sort.key)
      const missingA = a === null
      const missingB = b === null
      if (missingA !== missingB) return missingA ? 1 : -1
      const delta = compareValues(a, b)
      return sort.desc ? -delta : delta
    })
  }, [data, busca, statusFilter, sort])
  const pages = Math.max(1, Math.ceil(filtered.length / porPagina))
  const currentPage = Math.min(pagina, pages)
  const shown = filtered.slice((currentPage - 1) * porPagina, currentPage * porPagina)
  const total = data?.resumo?.total || 0
  const semJust = data?.semJustificativa || 0

  function updateSort(key) {
    setSort(current => ({ key, desc: current.key === key ? !current.desc : key === 'tmaSegundos' }))
    setPagina(1)
  }
  return <section className="logan-carta">
    <div className="logan-hero">
      <div className="logan-heading">
        <span className="logan-eyebrow">OPERAÇÃO <span className="logan-breadcrumb-dot">/</span> LOGAN</span>
        <h1>Carta Controle TMA</h1>
        <p>Acompanhamento de eficiência e tempo médio por carreta.</p>
      </div>
      <div className="logan-hero-actions">
        <div className="logan-filters">
          <label>Início<input type="date" value={inicio} max={fim} onChange={e => setInicio(e.target.value)} /></label>
          <label>Fim<input type="date" value={fim} min={inicio} onChange={e => setFim(e.target.value)} /></label>
          <label>Turno<select value={turno} onChange={e => setTurno(e.target.value)}>
            <option value="">Todos</option>
            <option value="A">A · 06–14h</option>
            <option value="B">B · 14–22h</option>
            <option value="C">C · 22–06h</option>
          </select></label>
        </div>
        <button type="button" className="logan-refresh" onClick={() => setRevision(n => n + 1)}
          disabled={loading} title="Recarregar os dados já armazenados no banco">
          <span aria-hidden="true">↻</span> {loading ? 'Atualizando…' : 'Atualizar painel'}
        </button>
      </div>
    </div>

    {erro && <div role="alert" className="logan-alert logan-alert-error">{erro}</div>}
    {loading && <p role="status" className="logan-loading">Consultando registros da operação…</p>}
    {data && <>
      <div className="logan-sync-strip">
        <div className="logan-sync-info"><span className="logan-sync-dot" />
          <span><strong>Última carga:</strong> {formatTimestamp(data.ultimaImportacao)}</span>
          <span className="logan-sync-separator">·</span>
          <span>Horário da Bahia</span>
        </div>
        <span className="logan-sync-tag">Coleta automática pendente</span>
      </div>
      {!data.conexaoSeparadaConfigurada && <div className="logan-alert logan-alert-warning">
        A conexão exclusiva do Logan ainda não está configurada neste servidor.
      </div>}
      <div className="logan-kpis">
        <Card title="Carretas no período" value={total} hint="Documentos cruzados" icon="▤" />
        <Card title="EFA médio" value={duration(data.resumo.efaMedia)} hint="Meta ≤ 01:20:00" icon="◷" variant={data.resumo.efaMedia !== null && data.resumo.efaMedia > 4800 ? 'attention' : 'neutral'} />
        <Card title="TMA médio" value={duration(data.resumo.tmaMedio)} hint="Meta ≤ 02:00:00" icon="◴" variant={data.resumo.tmaMedio !== null && data.resumo.tmaMedio > 7200 ? 'danger' : 'neutral'} />
        <Card title="Acima da meta" value={data.resumo.acimaMeta} hint={String(semJust) + ' aguardando justificativa'} icon="!" variant="danger" />
        <Card title="Em atendimento" value={data.resumo.emAtendimento} hint="Operações não finalizadas" icon="↻" variant="info" />
      </div>

      <div className="logan-section-title">
        <div><h2>Eficiência por categoria</h2><p>Frota fixa e Spot com detalhamento por turno</p></div>
        <div className="logan-targets"><span><i className="logan-target-dot efa" />EFA ≤ 01:20</span><span><i className="logan-target-dot tma" />TMA ≤ 02:00</span></div>
      </div>
      <div className="logan-categories">{Object.entries(data.categorias).map(([name, category]) =>
        <article key={name} className="logan-category-panel">
          <div className="logan-category-heading">
            <span className={'logan-category-icon ' + (name === 'Frota Fixa' ? 'fixed' : 'spot')}>{name === 'Frota Fixa' ? 'FF' : 'SP'}</span>
            <div><h3>{name}</h3><span>{category.total} carretas</span></div>
            <strong className="logan-category-count">{category.total}</strong>
          </div>
          <div className="logan-category-measures">
            <div><span>EFA médio</span><strong>{duration(category.efaMedia)}</strong></div>
            <div><span>TMA médio</span><strong className={category.tmaMedio > 7200 ? 'logan-text-danger' : ''}>{duration(category.tmaMedio)}</strong></div>
          </div>
          <div className="logan-turnos">{Object.entries(category.turnos).map(([turn, values]) =>
            <div key={turn} className="logan-shift-card">
              <div><span>Turno {turn}</span><small>{turn === 'A' ? '06–14h' : turn === 'B' ? '14–22h' : '22–06h'}</small></div>
              <strong className={values.tmaMedio > 7200 ? 'logan-text-danger' : ''}>{duration(values.tmaMedio)}</strong>
              <small>{values.total} {values.total === 1 ? 'carreta' : 'carretas'}</small>
            </div>
          )}</div>
        </article>
      )}</div>

      <section className="logan-table-panel" aria-label="Relatório detalhado de TMA">
        <div className="logan-table-heading">
          <div><h2>TMA por carreta</h2><p>Relação de documentos, tempos e justificativas</p></div>
          <span className="logan-count-pill">{filtered.length} de {total} registros</span>
        </div>
        <div className="logan-table-toolbar">
          <label className="logan-search"><span aria-hidden="true">⌕</span>
            <input type="search" placeholder="Buscar placa, documento, motorista…" aria-label="Pesquisar carretas"
              value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
          <div className="logan-status-filters" role="group" aria-label="Filtrar por situação">
            {[
              ['todos', 'Todos'], ['late', 'Acima da meta'], ['pending', 'Em atendimento'],
              ['good', 'Dentro da meta'], ['no-note', 'Sem justificativa'],
            ].map(([value, label]) => <button key={value} type="button" aria-pressed={statusFilter === value}
              className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{label}</button>)}
          </div>
        </div>
        <div className="logan-table-scroll">
          <table className="logan-results-table">
            <thead><tr>{COLUMNS.map(([key, title]) =>
              <th key={key} scope="col">
                {key === 'justificativa' ? title :
                  <button type="button" className="logan-sort-btn" onClick={() => updateSort(key)}
                    aria-label={'Ordenar por ' + title} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                    {title}<span aria-hidden="true">{sort.key === key ? sort.desc ? ' ↓' : ' ↑' : ' ↕'}</span>
                  </button>}
              </th>
            )}</tr></thead>
            <tbody>{shown.map((row, i) => <OperationRow key={row.documento + '-' + row.placa + '-' + i} row={row} onJustify={setSelecionado} />)}</tbody>
          </table>
          {!shown.length && <div className="logan-empty-state">
            <strong>Nenhum registro encontrado</strong>
            <p>{total ? 'Experimente alterar a busca ou o filtro de status.' : 'Não há documentos cruzados neste período.'}</p>
          </div>}
        </div>
        <footer className="logan-table-footer">
          <label>Exibir <select value={porPagina} onChange={e => setPorPagina(Number(e.target.value))}>
            {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
          </select> por página</label>
          <span>{filtered.length === 0 ? '0' : (currentPage - 1) * porPagina + 1}–{Math.min(currentPage * porPagina, filtered.length)} de {filtered.length}</span>
          <div className="logan-pagination">
            <button type="button" onClick={() => setPagina(n => Math.max(1, n - 1))} disabled={currentPage <= 1} aria-label="Página anterior">‹</button>
            <span>Página {currentPage} de {pages}</span>
            <button type="button" onClick={() => setPagina(n => Math.min(pages, n + 1))} disabled={currentPage >= pages} aria-label="Próxima página">›</button>
          </div>
        </footer>
      </section>
    </>}
    {selecionado && <JustificativaModal linha={selecionado} onClose={() => setSelecionado(null)}
      onSaved={() => { setSelecionado(null); setRevision(n => n + 1) }} />}
  </section>
}
