import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

function todayLocal() {
  const date = new Date()
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

export default function EscalonadaAdminScreen() {
  const today = useMemo(() => todayLocal(), [])
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [data, setData] = useState({
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
  })
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadReport()
  }, [])

  async function loadReport(event) {
    event?.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await api.get(
        `/api/escalonada/admin?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      setData(response)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
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
      sheet.autoFilter = {
        from: 'A1',
        to: 'J1',
      }

      for (let index = 2; index <= sheet.rowCount; index += 1) {
        sheet.getCell(`D${index}`).numFmt = '#,##0'
        sheet.getCell(`E${index}`).numFmt = 'R$ #,##0.00'
        sheet.getCell(`H${index}`).numFmt = '0%'
        sheet.getCell(`I${index}`).numFmt = 'R$ #,##0.00'
        sheet.getCell(`J${index}`).numFmt = 'R$ #,##0.00'
      }

      const summary = workbook.addWorksheet('Resumo')
      summary.columns = [
        { header: 'Indicador', key: 'indicador', width: 28 },
        { header: 'Valor', key: 'valor', width: 22 },
      ]
      summary.addRows([
        { indicador: 'Período', valor: `${dateLabel(from)} a ${dateLabel(to)}` },
        { indicador: 'Registros', valor: data.resumo.registros },
        { indicador: 'Ganharam escalonada', valor: data.resumo.ganhou },
        { indicador: 'Pick&Pack', valor: data.resumo.pickpack },
        { indicador: 'Não ganharam', valor: data.resumo.sem_incentivo },
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

  return (
    <section style={styles.page}>
      <div style={styles.header}>
        <div>
          <span style={styles.kicker}>RELATÓRIO ADM</span>
          <h1 style={styles.title}>Escalonada diária</h1>
          <p style={styles.subtitle}>
            Veja quem ganhou, quem não ganhou e quem ficou em Pick&Pack por dia.
          </p>
        </div>
      </div>

      <form style={styles.filters} onSubmit={loadReport}>
        <label style={styles.field}>
          <span>Data inicial</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label style={styles.field}>
          <span>Data final</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button style={styles.primaryButton} type="submit" disabled={loading}>
          {loading ? 'Carregando...' : 'Aplicar período'}
        </button>
        <button
          style={styles.secondaryButton}
          type="button"
          onClick={exportXlsx}
          disabled={loading || exporting || !data.resultados?.length}
        >
          {exporting ? 'Gerando XLSX...' : 'Baixar XLSX'}
        </button>
      </form>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.cards}>
        <article style={styles.card}>
          <span style={styles.cardLabel}>GANHARAM</span>
          <strong style={styles.cardValue}>{number(data.resumo?.ganhou)}</strong>
          <small style={styles.cardSmall}>{currency(data.resumo?.incentivo)} em incentivos</small>
        </article>
        <article style={styles.card}>
          <span style={styles.cardLabel}>PICK&PACK</span>
          <strong style={styles.cardValue}>{number(data.resumo?.pickpack)}</strong>
          <small style={styles.cardSmall}>sem escalonada pela regra</small>
        </article>
        <article style={styles.card}>
          <span style={styles.cardLabel}>NÃO GANHARAM</span>
          <strong style={styles.cardValue}>{number(data.resumo?.sem_incentivo)}</strong>
          <small style={styles.cardSmall}>fora das faixas de incentivo</small>
        </article>
        <article style={styles.card}>
          <span style={styles.cardLabel}>TOTAL DO PERÍODO</span>
          <strong style={styles.cardValue}>{currency(data.resumo?.valor_total)}</strong>
          <small style={styles.cardSmall}>{number(data.resumo?.registros)} registros</small>
        </article>
      </div>

      <div style={styles.panel}>
        {loading ? (
          <div style={styles.empty}>Carregando relatório...</div>
        ) : data.resultados?.length === 0 ? (
          <div style={styles.empty}>Nenhum resultado encontrado no período selecionado.</div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Dia</th>
                  <th style={styles.th}>Usuário</th>
                  <th style={styles.th}>Pontuação</th>
                  <th style={styles.th}>Valor base</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Faixa</th>
                  <th style={styles.th}>Incentivo</th>
                  <th style={styles.th}>Total do dia</th>
                </tr>
              </thead>
              <tbody>
                {data.resultados.map((row) => (
                  <tr key={row.id}>
                    <td style={styles.td}>{dateLabel(row.data_ref)}</td>
                    <td style={styles.td}>
                      <strong>{row.usuario_nome}</strong>
                      <small style={styles.login}>{row.wms_login || 'Sem login WMS'}</small>
                    </td>
                    <td style={styles.td}>{number(row.pontuacao)}</td>
                    <td style={styles.td}>{currency(row.valor_base)}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, ...statusStyle(row.status) }}>
                        {row.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {row.pickpack ? '-' : row.percentual > 0 ? `${row.percentual}%` : '-'}
                    </td>
                    <td style={styles.td}>
                      <strong style={row.incentivo > 0 ? styles.gain : styles.muted}>
                        {row.incentivo > 0 ? '+ ' + currency(row.incentivo) : currency(0)}
                      </strong>
                    </td>
                    <td style={styles.td}><strong>{currency(row.valor_total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

const styles = {
  page: { display: 'grid', gap: 22 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 },
  kicker: { display: 'block', fontSize: 11, letterSpacing: '0.18em', fontWeight: 800, color: '#f2a900', marginBottom: 8 },
  title: { margin: 0, fontSize: 'clamp(30px, 4vw, 48px)', color: '#18263a' },
  subtitle: { margin: '8px 0 0', color: '#718096', fontSize: 15 },
  filters: { display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', background: '#fff', border: '1px solid #e1e7ef', borderRadius: 18, padding: 18 },
  field: { display: 'grid', gap: 7, color: '#667085', fontSize: 12, fontWeight: 700 },
  primaryButton: { border: 0, borderRadius: 12, background: '#ffb000', color: '#111827', fontWeight: 800, padding: '12px 18px', cursor: 'pointer' },
  secondaryButton: { border: '1px solid #d5dde8', borderRadius: 12, background: '#fff', color: '#26364c', fontWeight: 800, padding: '12px 18px', cursor: 'pointer' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 },
  card: { background: '#fff', border: '1px solid #e1e7ef', borderRadius: 18, padding: 20 },
  cardLabel: { fontSize: 11, letterSpacing: '0.12em', fontWeight: 800, color: '#97a3b6' },
  cardValue: { display: 'block', marginTop: 10, fontSize: 27, color: '#18263a' },
  cardSmall: { display: 'block', marginTop: 6, color: '#8995a8' },
  panel: { background: '#fff', border: '1px solid #e1e7ef', borderRadius: 20, overflow: 'hidden' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 1050 },
  th: { textAlign: 'left', padding: '13px 16px', fontSize: 11, letterSpacing: '0.07em', color: '#8b97a9', background: '#f8fafc', borderBottom: '1px solid #edf1f5' },
  td: { padding: '15px 16px', borderBottom: '1px solid #edf1f5', color: '#28364a', fontSize: 14 },
  badge: { display: 'inline-flex', borderRadius: 999, padding: '6px 10px', fontWeight: 800, fontSize: 12 },
  gain: { color: '#18864b' },
  muted: { color: '#8b97a9' },
  login: { display: 'block', color: '#98a2b3', marginTop: 4 },
  empty: { padding: 34, textAlign: 'center', color: '#7f8b9d' },
  error: { padding: '13px 15px', borderRadius: 12, background: '#fff0f0', color: '#b42318', border: '1px solid #ffd3d3' },
}
