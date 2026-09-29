import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

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
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

export default function EscalonadaScreen() {
  const [data, setData] = useState({
    totais: {
      valor_base: 0,
      incentivo: 0,
      valor_total: 0,
      dias: 0,
      dias_com_escalonada: 0,
    },
    resultados: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')

      try {
        const response = await api.get('/api/escalonada')
        if (active) setData(response)
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [])

  const totalPercent = useMemo(() => {
    const base = Number(data.totais?.valor_base || 0)
    const incentive = Number(data.totais?.incentivo || 0)
    return base > 0 ? (incentive / base) * 100 : 0
  }, [data.totais])

  if (loading) {
    return (
      <section style={styles.page}>
        <div style={styles.empty}>Carregando sua escalonada...</div>
      </section>
    )
  }

  return (
    <section style={styles.page}>
      <div style={styles.header}>
        <div>
          <span style={styles.kicker}>MEU RESULTADO</span>
          <h1 style={styles.title}>Minha Escalonada</h1>
          <p style={styles.subtitle}>
            Acompanhe sua pontuação, incentivo diário e o total acumulado.
          </p>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.cards}>
        <article style={styles.card}>
          <span style={styles.cardLabel}>TOTAL ACUMULADO</span>
          <strong style={styles.cardValue}>{currency(data.totais?.valor_total)}</strong>
          <small style={styles.cardSmall}>valor base + incentivos</small>
        </article>

        <article style={styles.card}>
          <span style={styles.cardLabel}>INCENTIVO ACUMULADO</span>
          <strong style={styles.cardValue}>{currency(data.totais?.incentivo)}</strong>
          <small style={styles.cardSmall}>
            média equivalente a {totalPercent.toFixed(1).replace('.', ',')}% sobre o valor base
          </small>
        </article>

        <article style={styles.card}>
          <span style={styles.cardLabel}>DIAS COM ESCALONADA</span>
          <strong style={styles.cardValue}>{number(data.totais?.dias_com_escalonada)}</strong>
          <small style={styles.cardSmall}>
            de {number(data.totais?.dias)} dias registrados
          </small>
        </article>
      </div>

      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <span style={styles.kicker}>HISTÓRICO DIÁRIO</span>
            <h2 style={styles.panelTitle}>Resultado por dia</h2>
          </div>
        </div>

        {data.resultados?.length === 0 ? (
          <div style={styles.empty}>
            Ainda não há resultado de escalonada vinculado ao seu usuário.
          </div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Dia</th>
                  <th style={styles.th}>Pontuação</th>
                  <th style={styles.th}>Valor base</th>
                  <th style={styles.th}>Situação</th>
                  <th style={styles.th}>Ganhou</th>
                  <th style={styles.th}>Total do dia</th>
                </tr>
              </thead>
              <tbody>
                {data.resultados.map((row) => (
                  <tr key={row.id}>
                    <td style={styles.td}>
                      <strong>{dateLabel(row.data_ref)}</strong>
                    </td>
                    <td style={styles.td}>{number(row.pontuacao)}</td>
                    <td style={styles.td}>{currency(row.valor_base)}</td>
                    <td style={styles.td}>
                      {row.pickpack ? (
                        <span style={styles.pickPackGroup}>
                          <span style={styles.pickPackBadge}>Pick&Pack</span>
                          <small style={styles.pickPackCount}>
                            {number(row.pickpack_qtd)} itens em Marketplace
                          </small>
                        </span>
                      ) : row.percentual > 0 ? (
                        <span style={styles.percentBadge}>{row.percentual}%</span>
                      ) : (
                        <span style={styles.neutralBadge}>Não ganhou</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <strong style={row.incentivo > 0 ? styles.gain : styles.muted}>
                        {row.incentivo > 0 ? '+ ' + currency(row.incentivo) : currency(0)}
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
        )}
      </div>
    </section>
  )
}

const styles = {
  page: { display: 'grid', gap: 24 },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 20,
  },
  kicker: {
    display: 'block',
    fontSize: 11,
    letterSpacing: '0.18em',
    fontWeight: 800,
    color: '#f2a900',
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 'clamp(30px, 4vw, 48px)',
    color: '#18263a',
  },
  subtitle: { margin: '8px 0 0', color: '#718096', fontSize: 15 },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#fff',
    border: '1px solid #e1e7ef',
    borderRadius: 20,
    padding: 24,
    boxShadow: '0 10px 30px rgba(35, 55, 80, 0.06)',
  },
  cardLabel: {
    fontSize: 11,
    letterSpacing: '0.12em',
    fontWeight: 800,
    color: '#97a3b6',
  },
  cardValue: {
    display: 'block',
    marginTop: 12,
    fontSize: 30,
    color: '#18263a',
  },
  cardSmall: { display: 'block', marginTop: 8, color: '#8995a8' },
  panel: {
    background: '#fff',
    border: '1px solid #e1e7ef',
    borderRadius: 22,
    overflow: 'hidden',
    boxShadow: '0 12px 34px rgba(35, 55, 80, 0.06)',
  },
  panelHeader: { padding: '22px 24px', borderBottom: '1px solid #edf1f5' },
  panelTitle: { margin: 0, color: '#18263a', fontSize: 22 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 760 },
  th: {
    textAlign: 'left',
    padding: '14px 20px',
    fontSize: 11,
    letterSpacing: '0.08em',
    color: '#8b97a9',
    background: '#f8fafc',
    borderBottom: '1px solid #edf1f5',
  },
  td: {
    padding: '17px 20px',
    borderBottom: '1px solid #edf1f5',
    color: '#28364a',
    fontSize: 14,
  },
  percentBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 999,
    background: '#e9f8ef',
    color: '#18864b',
    fontWeight: 800,
  },
  pickPackGroup: {
    display: 'grid',
    gap: 5,
    justifyItems: 'start',
  },
  pickPackBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 999,
    background: '#fff3d8',
    color: '#a86b00',
    fontWeight: 800,
  },
  pickPackCount: {
    color: '#8a6a2d',
    fontSize: 11,
  },
  neutralBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 999,
    background: '#f2f4f7',
    color: '#7a8799',
    fontWeight: 700,
  },
  gain: { color: '#18864b' },
  muted: { color: '#8b97a9' },
  empty: { padding: 32, color: '#7f8b9d', textAlign: 'center' },
  error: {
    padding: '14px 16px',
    borderRadius: 12,
    background: '#fff0f0',
    color: '#b42318',
    border: '1px solid #ffd3d3',
  },
}
