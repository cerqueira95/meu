import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import './CartaControleTma.css'

function todayBahia() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date())
  const p = Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]))
  return p.year + '-' + p.month + '-' + p.day
}
function duration(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  const n = Math.round(Number(value))
  return [Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60].map(x => String(x).padStart(2, '0')).join(':')
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
      .then(data => { if (active) { setHistorico(data.historico || []); setTexto(data.atual?.justificativa || '') } })
      .catch(e => { if (active) setErro(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [linha.documento])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setSaving(true)
    try {
      await api.post('/api/logan/justificativas', { documento: linha.documento, justificativa: texto })
      onSaved()
    } catch (e) { setErro(e.message) }
    finally { setSaving(false) }
  }
  return <div className="logan-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="logan-modal" role="dialog" aria-modal="true" aria-label="Justificativa de TMA">
      <header><h2>Justificativa de TMA</h2><button type="button" onClick={onClose} aria-label="Fechar">×</button></header>
      <div className="logan-modal-body">
        <p><b>Documento:</b> {linha.documento} <b>TMA:</b> {duration(linha.tmaSegundos)}</p>
        <form onSubmit={salvar}>
          <label htmlFor="logan-texto-justificativa">Motivo do TMA acima de 2 horas</label>
          <textarea id="logan-texto-justificativa" rows={5} minLength={5} maxLength={3000}
            value={texto} onChange={e => setTexto(e.target.value)} required disabled={loading || saving} />
          {erro && <p className="logan-warning" role="alert">{erro}</p>}
          <button type="submit" disabled={loading || saving || texto.trim().length < 5}>
            {saving ? 'Salvando…' : 'Salvar justificativa'}
          </button>
        </form>
        <h3>Histórico de alterações</h3>
        {loading ? <p>Carregando histórico…</p> : historico.length
          ? <ol className="logan-history">{historico.map((item, i) => <li key={i}>
              <b>{item.tipo_evento === 'EDICAO' ? 'Edição' : 'Criação'}</b>
              {' · '}{item.usuario_nome || 'Usuário não identificado'}
              {' · '}{new Date(item.criado_em).toLocaleString('pt-BR')}
              <p>{item.justificativa}</p>
            </li>)}</ol>
          : <p>Nenhuma justificativa registrada.</p>}
      </div>
    </section>
  </div>
}
export default function CartaControleTma() {
  const [inicio, setInicio] = useState(todayBahia)
  const [fim, setFim] = useState(todayBahia)
  const [turno, setTurno] = useState('')
  const [data, setData] = useState(null)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const [selecionado, setSelecionado] = useState(null)
  useEffect(() => {
    let active = true
    setLoading(true); setErro('')
    api.get('/api/logan/carta?' + new URLSearchParams({ inicio, fim, turno }))
      .then(r => { if (active) setData(r) })
      .catch(e => { if (active) { setErro(e.message); setData(null) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [inicio, fim, turno, revision])
  return <section className="logan-carta">
    <header className="logan-title">
      <div><small>Operação / Logan</small><h1>Carta Controle TMA</h1><p>Eficiência de atendimento e tempo médio por carreta</p></div>
      <div className="logan-filters">
        <label>Início<input type="date" value={inicio} max={fim} onChange={e => setInicio(e.target.value)} /></label>
        <label>Fim<input type="date" value={fim} min={inicio} onChange={e => setFim(e.target.value)} /></label>
        <label>Turno<select value={turno} onChange={e => setTurno(e.target.value)}>
          <option value="">Todos</option><option value="A">A · 06h–14h</option>
          <option value="B">B · 14h–22h</option><option value="C">C · 22h–06h</option>
        </select></label>
      </div>
    </header>
    {loading && <p role="status">Atualizando relatório…</p>}
    {erro && <p role="alert" className="logan-warning">{erro}</p>}
    {data && <>
      {data.semFonte && <p className="logan-warning">Base Logan não encontrada no banco desta instalação. A coleta automática está desligada.</p>}
      <p className="logan-warning">Dados da última importação: {data.ultimaImportacao ? new Date(data.ultimaImportacao).toLocaleString('pt-BR') : 'não disponível'}. A coleta automática ainda não está ativada.</p>
      <div className="logan-kpis">
        <article><span>Carretas</span><strong>{data.resumo.total}</strong></article>
        <article><span>EFA médio</span><strong>{duration(data.resumo.efaMedia)}</strong><small>Meta até 01:20:00</small></article>
        <article><span>TMA médio</span><strong>{duration(data.resumo.tmaMedio)}</strong><small>Meta até 02:00:00</small></article>
        <article><span>Acima da meta</span><strong>{data.resumo.acimaMeta}</strong><small>{data.semJustificativa} sem justificativa</small></article>
        <article><span>Em atendimento</span><strong>{data.resumo.emAtendimento}</strong></article>
      </div>
      <div className="logan-categories">{Object.entries(data.categorias).map(([name, c]) =>
        <article key={name}><h2>{name} <small>({c.total})</small></h2>
          <p>EFA: {duration(c.efaMedia)} · TMA: {duration(c.tmaMedio)}</p>
          <div className="logan-turnos">{Object.entries(c.turnos).map(([t, v]) =>
            <div key={t}><b>Turno {t}</b><strong>{duration(v.tmaMedio)}</strong><small>{v.total} carretas</small></div>
          )}</div>
        </article>
      )}</div>
      <h2>TMA por carreta</h2>
      <div className="logan-table"><table><thead><tr>
        {['Placa / carreta', 'Documento', 'Categoria', 'Turno', 'Transportadora', 'Motorista', 'EFA', 'TMA', 'Status', 'Justificativa'].map(h => <th key={h}>{h}</th>)}
      </tr></thead><tbody>
        {data.detalhes.map((row, i) => <tr key={row.documento + '-' + i}>
          <td>{row.placa} {row.carreta && <small>· {row.carreta}</small>}</td>
          <td>{row.documento}</td><td>{row.categoria}</td><td>{row.turno}</td>
          <td>{row.transportadora}</td><td>{row.motorista}</td>
          <td>{duration(row.efaSegundos)}</td><td>{duration(row.tmaSegundos)}</td>
          <td>{row.emAtendimento ? 'Em atendimento' : row.acimaMeta ? 'Acima da meta' : 'Dentro da meta'}</td>
          <td>{row.acimaMeta
            ? <button type="button" className="logan-action" onClick={() => setSelecionado(row)}>
                {row.justificativa ? 'Ver / editar' : 'Justificar'}
              </button>
            : '—'}</td>
        </tr>)}
      </tbody></table>{!data.detalhes.length && <p>Nenhum documento cruzado no período selecionado.</p>}</div>
    </>}
    {selecionado && <JustificativaModal linha={selecionado} onClose={() => setSelecionado(null)} onSaved={() => { setSelecionado(null); setRevision(n => n + 1) }} />}
  </section>
}
