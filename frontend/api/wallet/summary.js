import { getSessionUser } from '../_lib/session.js'
import { getWalletData } from '../_lib/remuneration-admin.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  const usuario = await getSessionUser(req)

  if (!usuario) {
    return res.status(401).json({
      status: 'error',
      message: 'Sessão não autenticada.',
    })
  }

  const start = normalizeDate(req.query?.inicio)
  const end = normalizeDate(req.query?.fim)

  if (!start || !end) {
    return res.status(400).json({
      status: 'error',
      message: 'Informe a data inicial e a data final.',
    })
  }

  if (start > end) {
    return res.status(400).json({
      status: 'error',
      message: 'A data inicial não pode ser maior que a data final.',
    })
  }

  try {
    const months = monthsBetween(start, end)
    const wallets = await Promise.all(
      months.map((month) => getWalletData(usuario.id, month)),
    )

    const entries = wallets
      .flatMap((wallet) => Array.isArray(wallet?.extrato) ? wallet.extrato : [])
      .filter((entry) => {
        const date = normalizeDate(entry?.data)
        return date && date >= start && date <= end
      })

    const total = roundMoney(
      entries.reduce(
        (sum, entry) => sum + Number(entry?.valor_creditado || 0),
        0,
      ),
    )

    const wmsRateio = roundMoney(
      entries
        .filter((entry) => entry?.tipo === 'wms')
        .reduce(
          (sum, entry) => sum + Number(entry?.valor_creditado || 0),
          0,
        ),
    )

    const escalonada = roundMoney(
      entries
        .filter((entry) => entry?.tipo === 'escalonada')
        .reduce(
          (sum, entry) => sum + Number(entry?.valor_creditado || 0),
          0,
        ),
    )

    const profile = String(usuario.perfil || '').trim().toUpperCase()
    const cargo = String(usuario.cargo || '').trim().toUpperCase()
    const operador = profile === 'OPERADOR' || cargo.includes('OPERADOR')

    return res.status(200).json({
      status: 'ok',
      periodo: {
        inicio: start,
        fim: end,
      },
      usuario: {
        id: Number(usuario.id),
        nome: usuario.nome,
        perfil: usuario.perfil || '',
        cargo: usuario.cargo || '',
        operador,
      },
      totais: {
        wms_rateio: wmsRateio,
        escalonada,
        total,
      },
    })
  } catch (error) {
    if (error?.code === 'USER_NOT_FOUND') {
      return res.status(404).json({
        status: 'error',
        message: 'Usuário não encontrado.',
      })
    }

    console.error('wallet_summary_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível carregar o resumo da carteira.',
    })
  }
}

function normalizeDate(value) {
  const text = String(value || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''

  const date = new Date(text + 'T12:00:00Z')
  if (Number.isNaN(date.getTime())) return ''

  const [year, month, day] = text.split('-').map(Number)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return ''
  }

  return text
}

function monthsBetween(start, end) {
  const [startYear, startMonth] = start.slice(0, 7).split('-').map(Number)
  const [endYear, endMonth] = end.slice(0, 7).split('-').map(Number)

  const months = []
  let year = startYear
  let month = startMonth

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)

    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  return months
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}
