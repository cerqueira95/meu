export const MAX_REPORT_DAYS = 31

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const utc = Date.UTC(year, month - 1, day)
  const d = new Date(utc)
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return utc
}

export function validateReportPeriod(inicio, fim) {
  const start = parseDate(inicio)
  const end = parseDate(fim)
  if (start === null || end === null || start > end) {
    const error = new Error('Informe datas válidas, com início anterior ou igual ao fim.')
    error.status = 400
    throw error
  }
  const inclusiveDays = Math.round((end - start) / 86400000) + 1
  if (inclusiveDays > MAX_REPORT_DAYS) {
    const error = new Error('Escolha no máximo ' + MAX_REPORT_DAYS + ' dias por coleta. Para períodos maiores, divida em intervalos menores.')
    error.status = 400
    throw error
  }
  return { dateFrom: inicio, dateTo: fim, timezone: 'America/Bahia', dias: inclusiveDays }
}
