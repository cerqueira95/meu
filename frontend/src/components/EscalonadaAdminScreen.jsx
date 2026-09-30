import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

function localIsoDate(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function currency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

function number(value) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function dateLabel(value) {
  const text = String(value || '').slice(0, 10)
  const [year, month, day] = text.split('-')
  return year && month && day ? `${day}/${month}/${year}` : text
}

function statusStyle(status) {
  if (status === 'Ganhou') {
    return { background: '#e9f8ef', color: '#18864b' }
  }

  if (status === 'Pick&Pack') {
    return { background: '#fff3d8', color: '#a86b00' }
  }

  return { background: '#f2f4f7', color: '#667085' }
}

function emptyReport() {
  return {
    resumo: {
      registros: 0,
      ganhou: 0,
      pickpack: 0,
      sem_incentivo: 0,
      valor_base: 0,
      incentivo: 0,
      valor_total: 0,
    },
    resultados: [],
  }
}

export default function EscalonadaAdminScreen() {
  const today = useMemo(() => localIsoDate(), [])
  const yesterday = useMemo(() => localIsoDate(-1), [])
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [data, setData] = useState(emptyReport)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [manualRunning, setManualRunning] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')

  useEffect(() => {
    let active = true

    async function loadInitialReport() {
      setLoading(true)
      setError('')

      try {
        let selectedFrom = today
        let selectedTo = today
        let response = await fetchReport(today, today)

        if (!response?.resultados?.length && yesterday !== today) {
          selectedFrom = yesterday
          selectedTo = yesterday
          response = await fetchReport(yesterday, yesterday)
        }

        if (!active) return
        setFrom(selectedFrom)
        setTo(selectedTo)
        setData(response)
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadInitialReport()

    return () => {
      active = false
    }
  }, [today, yesterday])

  async function fetchReport(startDate, endDate) {
    return api.get(
      `/api/escalonada/admin?from=${encodeURIComponent(startDate)}&to=${encodeURIComponent(endDate)}`,
    )
  }

  async function loadReport(event) {
    event?.preventDefault()

    if (!from || !to) {
      setError('Selecione a data inicial e a data final.')
      return
    }

    if (from > to) {
      setError('A data inicial não pode ser maior que a data final.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetchReport(from, to)
      setData(response)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function runManualCollection() {
    if (!from || !to) {
      setError('Selecione a data que deseja atualizar.')
      return
    }

    if (from !== to) {
      setError('Para rodar a coleta manual, selecione a mesma data no início e no final.')
      return
    }

    setManualRunning(true)
    setError('')
    setMessage('')

    try {
      const result = await api.post('/api/admin/remuneration', {
        action: 'reprocessar',
        data: from,
        origem: 'rateio',
      })

      const refreshed = await fetchReport(from, to)
      setData(refreshed)
      setMessage(
        result.message ||
          `Coleta de ${dateLabel(from)} atualizada com sucesso, sem duplicar registros.`,
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setManualRunning(false)
    }
  }

  async function exportXlsx() {
    if (!data.resultados?.length) {
      setError('Não há registros no período selecionado para exportar.')
      return
    }

    setExporting(true)
    setError('')

    try {
      const ExcelJSModule = await import('exceljs/dist/exceljs.min.js')
      const ExcelJS = ExcelJSModule.default || ExcelJSModule
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Warehouse'
      workbook.created = new Date()

      const sheet = workbook.addWorksheet('Dia a dia')
      sheet.columns = [
        { header: 'Data', key: 'data', width: 14 },
        { header: 'Usuário', key: 'usuario', width: 38 },
        { header: 'Login WMS', key: 'login', width: 22 },
        { header: 'Pontuação', key: 'pontuacao', width: 14 },
        { header: 'Valor base', key: 'valorBase', width: 16 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Pick&Pack qtd.', key: 'pickPackQtd', width: 16 },
        { header: 'Percentual', key: 'percentual', width: 14 },
        { header: 'Incentivo', key: 'incentivo', width: 16 },
        { header: 'Total do dia', key: 'total', width: 16 },
      ]

      for (const row of data.resultados) {
        sheet.addRow({
          data: dateLabel(row.data_ref),
          usuario: row.usuario_nome,
          login: row.wms_login || '',
          pontuacao: row.pontuacao,
          valorBase: row.valor_base,
          status: row.status,
          pickPackQtd: row.pickpack_qtd,
          percentual: row.percentual / 100,
          incentivo: row.incentivo,
          total: row.valor_total,
        })
      }

      sheet.getRow(1).font = { bold: true }
      sheet.getRow(1).alignment = { vertical: 'middle' }
      sheet.views = [{ state: 'frozen', ySplit: 1 }]
      sheet.autoFilter = { from: 'A1', to: 'J1' }

      for (let index = 2; index <= sheet.rowCount; index += 1) {
        sheet.getCell(`D${index}`).numFmt = '#,##0'
        sheet.getCell(`E${index}`).numFmt = 'R$ #,##0.00'
        sheet.getCell(`H${index}`).numFmt = '0%'
        sheet.getCell(`I${index}`).numFmt = 'R$ #,##0.00'
        sheet.getCell(`J${index}`).numFmt = 'R$ #,##0.00'
      }

      const summary = workbook.addWorksheet('Resumo')
      summary.columns = [
        { header: 'Indicador', key: 'indicador', width: 30 },
        { header: 'Valor', key: 'valor', width: 24 },
      ]
      summary.addRows([
        { indicador: 'Período', valor: `${dateLabel(from)} a ${dateLabel(to)}` },
        { indicador: 'Registros', valor: data.resumo.registros },
        { indicador: 'Com escalonada', valor: data.resumo.ganhou },
        { indicador: 'Pick&Pack', valor: data.resumo.pickpack },
        { indicador: 'Sem escalonada', valor: data.resumo.sem_incentivo },
        { indicador: 'Valor base acumulado', valor: data.resumo.valor_base },
        { indicador: 'Incentivo acumulado', valor: data.resumo.incentivo },
        { indicador: 'Total acumulado', valor: data.resumo.valor_total },
      ])
      summary.getRow(1).font = { bold: true }
      summary.getCell('B7').numFmt = 'R$ #,##0.00'
      summary.getCell('B8').numFmt = 'R$ #,##0.00'
      summary.getCell('B9').numFmt = 'R$ #,##0.00'

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `escalonada_${from}_a_${to}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (exportError) {
      console.error('escalonada_xlsx_error', exportError)
      setError('Não foi possível gerar o arquivo XLSX.')
    } finally {
      setExporting(false)
    }
  }

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')

    return (data.resultados || []).filter((row) => {
      const matchesQuery =
        !normalizedQuery ||
        String(row.usuario_nome || '').toLocaleLowerCase('pt-BR').includes(normalizedQuery) ||
        String(row.wms_login || '').toLocaleLowerCase('pt-BR').includes(normalizedQuery)

      const matchesStatus =
        statusFilter === 'todos' ||
        (statusFilter === 'ganhou' && row.status === 'Ganhou') ||
        (statusFilter === 'pickpack' && row.status === 'Pick&Pack') ||
        (statusFilter === 'sem' && row.status !== 'Ganhou' && row.status !== 'Pick&Pack')

      return matchesQuery && matchesStatus
    })
  }, [data.resultados, query, statusFilter])

  const periodText =
    from === to
      ? dateLabel(from)
      : `${dateLabel(from)} — ${dateLabel(to)}`

  return (
    <section style={styles.page}>
      <div style={styles.hero}>
        <div>
          <span style={styles.kicker}>GESTÃO • RELATÓRIOS</span>
          <h1 style={styles.title}>Escalonada</h1>
          <p style={styles.subtitle}>
            Visão administrativa do resultado diário, faixas de incentivo e valores acumulados.
          </p>
        </div>

        <div style={styles.reportType}>
          <span style={styles.reportTypeLabel}>RELATÓRIO ATIVO</span>
          <strong style={styles.reportTypeValue}>Escalonada diária</strong>
        </div>
      </div>

      <form style={styles.filterPanel} onSubmit={loadReport}>
        <div style={styles.filterHeading}>
          <div>
            <span style={styles.miniLabel}>PERÍODO DO RELATÓRIO</span>
            <strong style={styles.periodValue}>{periodText}</strong>
          </div>
          <span style={styles.recordPill}>
            {number(data.resumo?.registros)} {Number(data.resumo?.registros) === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        <div style={styles.filterControls}>
          <label style={styles.field}>
            <span>Data inicial</span>
            <input
              style={styles.input}
              type="date"
              value={from}
              max={today}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>

          <label style={styles.field}>
            <span>Data final</span>
            <input
              style={styles.input}
              type="date"
              value={to}
              max={today}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>

          <button style={styles.primaryButton} type="submit" disabled={loading || manualRunning}>
            {loading ? 'Carregando...' : 'Aplicar período'}
          </button>

          <button
            style={styles.manualButton}
            type="button"
            onClick={runManualCollection}
            disabled={loading || manualRunning}
          >
            {manualRunning ? 'Atualizando WMS...' : 'Rodar coleta da data'}
          </button>

          <button
            style={styles.secondaryButton}
            type="button"
            onClick={exportXlsx}
            disabled={loading || exporting || !data.resultados?.length}
          >
            {exporting ? 'Gerando XLSX...' : 'Exportar XLSX'}
          </button>
        </div>
      </form>

      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.success}>{message}</div>}

      <div style={styles.cards}>
        <article style={styles.card}>
          <span style={styles.cardLabel}>REGISTROS</span>
          <strong style={styles.cardValue}>{number(data.resumo?.registros)}</strong>
          <small style={styles.cardSmall}>resultados no período</small>
        </article>

        <article style={styles.card}>
          <span style={styles.cardLabel}>COM ESCALONADA</span>
          <strong style={styles.cardValue}>{number(data.resumo?.ganhou)}</strong>
          <small style={styles.cardSmall}>{currency(data.resumo?.incentivo)} em incentivos</small>
        </article>

        <article style={styles.card}>
          <span style={styles.cardLabel}>PICK&PACK</span>
          <strong style={styles.cardValue}>{number(data.resumo?.pickpack)}</strong>
          <small style={styles.cardSmall}>30 ou mais itens Marketplace</small>
        </article>

        <article style={styles.card}>
          <span style={styles.cardLabel}>SEM ESCALONADA</span>
          <strong style={styles.cardValue}>{number(data.resumo?.sem_incentivo)}</strong>
          <small style={styles.cardSmall}>fora das faixas de incentivo</small>
        </article>

        <article style={{ ...styles.card, ...styles.totalCard }}>
          <span style={styles.cardLabel}>TOTAL DO PERÍODO</span>
          <strong style={styles.cardValue}>{currency(data.resumo?.valor_total)}</strong>
          <small style={styles.cardSmall}>
            base {currency(data.resumo?.valor_base)} + incentivo
          </small>
        </article>
      </div>

      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <span style={styles.miniLabel}>DETALHAMENTO</span>
            <h2 style={styles.panelTitle}>Resultado por colaborador</h2>
          </div>

          <div style={styles.tableFilters}>
            <input
              style={styles.searchInput}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nome ou login WMS"
            />
            <select
              style={styles.select}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="ganhou">Com escalonada</option>
              <option value="pickpack">Pick&Pack</option>
              <option value="sem">Sem escalonada</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={styles.empty}>Carregando relatório...</div>
        ) : !data.resultados?.length ? (
          <div style={styles.empty}>
            Nenhum resultado encontrado no período selecionado.
          </div>
        ) : !filteredRows.length ? (
          <div style={styles.empty}>
            Nenhum colaborador corresponde aos filtros aplicados.
          </div>
        ) : (
          <>
            <div style={styles.tableInfo}>
              Exibindo {number(filteredRows.length)} de {number(data.resultados.length)} registros
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Dia</th>
                    <th style={styles.th}>Colaborador</th>
                    <th style={styles.th}>Pontuação</th>
                    <th style={styles.th}>Valor base</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Faixa</th>
                    <th style={styles.th}>Incentivo</th>
                    <th style={styles.th}>Total do dia</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td style={styles.td}>
                        <strong>{dateLabel(row.data_ref)}</strong>
                      </td>
                      <td style={styles.td}>
                        <strong style={styles.userName}>{row.usuario_nome}</strong>
                        <small style={styles.login}>
                          {row.wms_login || 'Sem login WMS'}
                        </small>
                      </td>
                      <td style={styles.td}>{number(row.pontuacao)}</td>
                      <td style={styles.td}>{currency(row.valor_base)}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, ...statusStyle(row.status) }}>
                          {row.status}
                        </span>
                        {row.pickpack ? (
                          <small style={styles.pickPackCount}>
                            {number(row.pickpack_qtd)} itens Marketplace
                          </small>
                        ) : null}
                      </td>
                      <td style={styles.td}>
                        {row.pickpack ? '—' : row.percentual > 0 ? `${row.percentual}%` : '—'}
                      </td>
                      <td style={styles.td}>
                        <strong style={row.incentivo > 0 ? styles.gain : styles.muted}>
                          {row.incentivo > 0 ? `+ ${currency(row.incentivo)}` : currency(0)}
                        </strong>
                      </td>
                      <td style={styles.td}>
                        <strong>{currency(row.valor_total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

const styles = {
  page: {
    width: '100%',
    maxWidth: 1420,
    margin: '0 auto',
    display: 'grid',
    gap: 20,
  },
  hero: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 24,
    flexWrap: 'wrap',
  },
  kicker: {
    display: 'block',
    fontSize: 10,
    letterSpacing: '0.2em',
    fontWeight: 900,
    color: '#f2a900',
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 'clamp(30px, 3.6vw, 46px)',
    lineHeight: 1.04,
    color: '#0f2747',
  },
  subtitle: {
    margin: '9px 0 0',
    color: '#718096',
    fontSize: 14,
    maxWidth: 720,
  },
  reportType: {
    minWidth: 210,
    padding: '13px 16px',
    borderRadius: 14,
    border: '1px solid #dfe6ee',
    background: 'rgba(255,255,255,0.72)',
  },
  reportTypeLabel: {
    display: 'block',
    fontSize: 9,
    letterSpacing: '0.14em',
    fontWeight: 900,
    color: '#98a2b3',
    marginBottom: 5,
  },
  reportTypeValue: {
    color: '#23364f',
    fontSize: 14,
  },
  filterPanel: {
    display: 'grid',
    gap: 15,
    background: '#fff',
    border: '1px solid #dfe6ee',
    borderRadius: 18,
    padding: '16px 18px',
    boxShadow: '0 8px 26px rgba(25, 49, 79, 0.045)',
  },
  filterHeading: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  miniLabel: {
    display: 'block',
    fontSize: 9,
    letterSpacing: '0.16em',
    fontWeight: 900,
    color: '#f2a900',
    marginBottom: 5,
  },
  periodValue: {
    display: 'block',
    color: '#253750',
    fontSize: 15,
  },
  recordPill: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    padding: '7px 11px',
    background: '#f3f6f9',
    color: '#667085',
    fontWeight: 800,
    fontSize: 11,
  },
  filterControls: {
    display: 'flex',
    gap: 10,
    alignItems: 'end',
    flexWrap: 'wrap',
  },
  field: {
    display: 'grid',
    gap: 6,
    color: '#667085',
    fontSize: 11,
    fontWeight: 800,
  },
  input: {
    height: 40,
    minWidth: 160,
    border: '1px solid #d7e0ea',
    borderRadius: 10,
    padding: '0 11px',
    color: '#26364c',
    background: '#fff',
    font: 'inherit',
  },
  primaryButton: {
    height: 40,
    border: 0,
    borderRadius: 10,
    background: '#ffb000',
    color: '#111827',
    fontWeight: 900,
    padding: '0 17px',
    cursor: 'pointer',
  },
  manualButton: {
    height: 40,
    border: '1px solid #155eef',
    borderRadius: 10,
    background: '#eef4ff',
    color: '#1849a9',
    fontWeight: 900,
    padding: '0 17px',
    cursor: 'pointer',
  },
  secondaryButton: {
    height: 40,
    border: '1px solid #d5dde8',
    borderRadius: 10,
    background: '#fff',
    color: '#26364c',
    fontWeight: 900,
    padding: '0 17px',
    cursor: 'pointer',
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  card: {
    minHeight: 112,
    background: '#fff',
    border: '1px solid #dfe6ee',
    borderRadius: 17,
    padding: '17px 18px',
    boxShadow: '0 8px 24px rgba(25, 49, 79, 0.045)',
  },
  totalCard: {
    background: 'linear-gradient(145deg, #fff 0%, #fbfcfe 100%)',
  },
  cardLabel: {
    fontSize: 9,
    letterSpacing: '0.13em',
    fontWeight: 900,
    color: '#93a0b3',
  },
  cardValue: {
    display: 'block',
    marginTop: 9,
    fontSize: 25,
    lineHeight: 1.05,
    color: '#102a4d',
  },
  cardSmall: {
    display: 'block',
    marginTop: 7,
    color: '#8b97a8',
    fontSize: 11,
  },
  panel: {
    background: '#fff',
    border: '1px solid #dfe6ee',
    borderRadius: 19,
    overflow: 'hidden',
    boxShadow: '0 10px 28px rgba(25, 49, 79, 0.05)',
  },
  panelHeader: {
    padding: '17px 19px',
    borderBottom: '1px solid #edf1f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  panelTitle: {
    margin: 0,
    color: '#172b46',
    fontSize: 19,
  },
  tableFilters: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  searchInput: {
    width: 245,
    maxWidth: '70vw',
    height: 38,
    border: '1px solid #d7e0ea',
    borderRadius: 10,
    padding: '0 11px',
    color: '#26364c',
    background: '#fff',
    font: 'inherit',
  },
  select: {
    height: 38,
    border: '1px solid #d7e0ea',
    borderRadius: 10,
    padding: '0 10px',
    color: '#26364c',
    background: '#fff',
    font: 'inherit',
    fontWeight: 700,
  },
  tableInfo: {
    padding: '9px 19px',
    background: '#fbfcfd',
    color: '#8b97a8',
    fontSize: 11,
    borderBottom: '1px solid #edf1f5',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: 1080,
  },
  th: {
    textAlign: 'left',
    padding: '12px 15px',
    fontSize: 9,
    letterSpacing: '0.08em',
    color: '#8b97a9',
    background: '#f7f9fb',
    borderBottom: '1px solid #edf1f5',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '13px 15px',
    borderBottom: '1px solid #edf1f5',
    color: '#28364a',
    fontSize: 12,
    verticalAlign: 'middle',
  },
  userName: {
    color: '#20334e',
    fontSize: 12,
  },
  badge: {
    display: 'inline-flex',
    borderRadius: 999,
    padding: '5px 9px',
    fontWeight: 900,
    fontSize: 10,
    whiteSpace: 'nowrap',
  },
  pickPackCount: {
    display: 'block',
    marginTop: 5,
    color: '#9a7429',
    fontSize: 9,
  },
  gain: {
    color: '#18864b',
  },
  muted: {
    color: '#8b97a9',
  },
  login: {
    display: 'block',
    color: '#98a2b3',
    marginTop: 3,
    fontSize: 10,
  },
  empty: {
    padding: 42,
    textAlign: 'center',
    color: '#7f8b9d',
    fontSize: 13,
  },
  success: {
    padding: '12px 14px',
    borderRadius: 12,
    background: '#ecfdf3',
    color: '#027a48',
    border: '1px solid #abefc6',
    fontSize: 12,
    fontWeight: 700,
  },
  error: {
    padding: '12px 14px',
    borderRadius: 12,
    background: '#fff0f0',
    color: '#b42318',
    border: '1px solid #ffd3d3',
    fontSize: 12,
    fontWeight: 700,
  },
}
