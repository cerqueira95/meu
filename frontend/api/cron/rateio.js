import { sql } from '../_lib/db.js'
import { currentBahiaDate } from '../_lib/wms-client.js'
import {
  collectCurrentRateio,
  publicFailureMessage,
} from '../_lib/wms-sync.js'

// IMPORTANTE PARA MANUTENÇÃO:
// Este endpoint é chamado por automação externa. Ele deve permanecer idempotente:
// várias chamadas no mesmo dia não podem duplicar uma coleta que já terminou com status "ok".
// A autenticação é feita pelo header "Authorization: Bearer <CRON_SECRET>".
// Nunca grave o valor real de CRON_SECRET neste arquivo ou em documentação versionada.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  const expected = String(process.env.CRON_SECRET || '')
  const received = String(req.headers.authorization || '')

  if (!expected || received !== `Bearer ${expected}`) {
    return res.status(401).json({
      status: 'error',
      message: 'Cron não autorizado.',
    })
  }

  try {
    // A data de referência é sempre a data local da Bahia, evitando divergência com UTC.
    const date = currentBahiaDate()

    // Antes de coletar novamente, verificamos as duas partes que compõem a coleta diária.
    // Só pulamos quando AMBAS já concluíram com sucesso.
    const [rateio, item] = await Promise.all([
      sql`
        SELECT status
        FROM wms_rateio_coletas
        WHERE data_ref = ${date}
        LIMIT 1
      `,
      sql`
        SELECT status
        FROM wms_item_coletas
        WHERE data_ref = ${date}
        LIMIT 1
      `,
    ])

    if (rateio[0]?.status === 'ok' && item[0]?.status === 'ok') {
      return res.status(200).json({
        status: 'ok',
        skipped: true,
        date,
        message: 'Coleta de hoje já concluída.',
      })
    }

    // Se a coleta do dia ainda não estiver completa, executa a sincronização real do WMS.
    // A tentativa de segurança (ex.: 08:02) pode chamar este mesmo endpoint sem duplicar
    // uma coleta que já tenha sido finalizada pela tentativa principal.
    const result = await collectCurrentRateio()

    return res.status(200).json({
      status: 'ok',
      skipped: false,
      ...result,
    })
  } catch (error) {
    console.error('wms_cron_rateio_error', {
      code: error?.code || null,
      status: error?.status || null,
      message: error?.message || 'unknown',
    })

    return res.status(502).json({
      status: 'error',
      message: publicFailureMessage(error),
    })
  }
}
