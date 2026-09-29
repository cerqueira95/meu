import { sql } from './db.js'

export async function saveRateioCollection({ date, source, rows }) {
  const collectionRows = await sql`
    INSERT INTO wms_rateio_coletas (
      data_ref,
      coletado_em,
      total_registros,
      status,
      erro,
      fonte,
      atualizado_em
    )
    VALUES (
      ${date},
      NOW(),
      ${rows.length},
      'ok',
      NULL,
      ${source},
      NOW()
    )
    ON CONFLICT (data_ref)
    DO UPDATE SET coletado_em = NOW(),
                  total_registros = EXCLUDED.total_registros,
                  status = 'ok',
                  erro = NULL,
                  fonte = EXCLUDED.fonte,
                  atualizado_em = NOW()
    RETURNING id
  `

  const collectionId = Number(collectionRows[0].id)

  await sql`
    DELETE FROM wms_rateio_registros
    WHERE data_ref = ${date}
  `

  for (const row of rows) {
    await sql`
      INSERT INTO wms_rateio_registros (
        coleta_id,
        data_ref,
        wms_usuario_id,
        usuario_nome,
        tipo,
        creditos,
        debitos,
        total,
        valor,
        coletado_em
      )
      VALUES (
        ${collectionId},
        ${date},
        ${row.wmsUsuarioId},
        ${row.usuarioNome},
        ${row.tipo},
        ${row.creditos},
        ${row.debitos},
        ${row.total},
        ${row.valor},
        NOW()
      )
    `
  }

  return {
    collectionId,
    count: rows.length,
  }
}

export async function saveRateioFailure({ date, message }) {
  await sql`
    INSERT INTO wms_rateio_coletas (
      data_ref,
      coletado_em,
      total_registros,
      status,
      erro,
      fonte,
      atualizado_em
    )
    VALUES (
      ${date},
      NOW(),
      0,
      'erro',
      ${String(message || 'Falha na coleta').slice(0, 255)},
      NULL,
      NOW()
    )
    ON CONFLICT (data_ref)
    DO UPDATE SET coletado_em = NOW(),
                  status = 'erro',
                  erro = EXCLUDED.erro,
                  atualizado_em = NOW()
  `
}
