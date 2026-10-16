import { sql } from '../_lib/db.js'
import { isAuthorizedWmsCron } from '../_lib/wms-cron-auth.js'
import { currentBahiaDate } from '../_lib/wms-client.js'
import {
  collectCurrentRateio,
  publicFailureMessage,
} from '../_lib/wms-sync.js'

// IMPORTANTE PARA MANUTENÇÃO:
// Este endpoint é chamado por automação externa. Ele deve permanecer idempotente:
// várias chamadas normais no mesmo dia não podem duplicar uma coleta já concluída.
// O parâmetro ?fechamento=1 força uma nova leitura do mesmo dia para atualizar
// o fechamento noturno. A rotina de persistência substitui os registros daquele dia,
// então a recoleta atualiza valores e não soma/duplica lançamentos.
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

  if (!(await isAuthorizedWmsCron(req))) {
    return res.status(401).json({
      status: 'error',
      message: 'Cron não autorizado.',
    })
  }

  try {
    // A data de referência é sempre a data local da Bahia, evitando divergência com UTC.
    const date = currentBahiaDate()
    const fechamento = ['1', 'true', 'sim'].includes(
      String(req.query?.fechamento || '').trim().toLowerCase(),
    )

    // Antes de coletar novamente, verificamos as duas partes que compõem a coleta diária.
    // Na execução normal, só coletamos se o dia ainda não estiver concluído.
    // No fechamento noturno, ignoramos esse atalho e consultamos o WMS outra vez.
    const [rateio, item] = await Promise.all([
      sql`
        SELECT status, total_registros, coletado_em
        FROM wms_rateio_coletas
        WHERE data_ref = ${date}
        LIMIT 1
      `,
      sql`
        SELECT status, total_registros, coletado_em
        FROM wms_item_coletas
        WHERE data_ref = ${date}
        LIMIT 1
      `,
    ])

    if (
      !fechamento &&
      rateio[0]?.status === 'ok' &&
      item[0]?.status === 'ok'
    ) {
      return res.status(200).json({
        status: 'ok',
        skipped: true,
        fechamento: false,
        date,
        rateioCount: Number(rateio[0].total_registros || 0),
        itemCount: Number(item[0].total_registros || 0),
        coletadoEm: item[0].coletado_em,
        message: 'Coleta de hoje já concluída.',
      })
    }

    // collectCurrentRateio() grava novamente a fotografia atual do dia.
    // wms_rateio_registros e wms_item_registros daquele dia são substituídos,
    // portanto novas produções entram e registros antigos não são duplicados.
    const result = await collectCurrentRateio()

    return res.status(200).json({
      status: 'ok',
      skipped: false,
      fechamento,
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
