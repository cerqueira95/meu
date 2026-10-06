import { sql } from './db.js'

export async function saveItemCollection({ date, source, rows }) {
  const collectionRows = await sql`
    INSERT INTO wms_item_coletas (
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
    DELETE FROM wms_item_registros
    WHERE data_ref = ${date}
  `

  if (rows.length > 0) {
    const payload = rows.map((row) => ({
      mapa: row.mapa,
      palete: row.palete,
      entrega: row.entrega,
      caixa: row.caixa,
      area_separacao: row.areaSeparacao,
      codigo_item: row.codigoItem,
      item_descricao: row.itemDescricao,
      quantidade: row.quantidade,
      origem: row.origem,
      equipamento: row.equipamento,
      inicio_texto: row.inicioTexto,
      fim_texto: row.fimTexto,
      duracao_seg: row.duracaoSeg,
      usuario_login: row.usuarioLogin,
      usuario_nome: row.usuarioNome,
    }))

    await sql`
      INSERT INTO wms_item_registros (
        coleta_id,
        data_ref,
        mapa,
        palete,
        entrega,
        caixa,
        area_separacao,
        codigo_item,
        item_descricao,
        quantidade,
        origem,
        equipamento,
        inicio_texto,
        fim_texto,
        duracao_seg,
        usuario_login,
        usuario_nome,
        coletado_em
      )
      SELECT
        ${collectionId},
        ${date}::date,
        x.mapa,
        x.palete,
        x.entrega,
        x.caixa,
        x.area_separacao,
        x.codigo_item,
        x.item_descricao,
        x.quantidade,
        x.origem,
        x.equipamento,
        x.inicio_texto,
        x.fim_texto,
        x.duracao_seg,
        x.usuario_login,
        x.usuario_nome,
        NOW()
      FROM jsonb_to_recordset(
        CASE
          WHEN jsonb_typeof(${JSON.stringify(payload)}::jsonb) = 'array'
            THEN ${JSON.stringify(payload)}::jsonb
          ELSE '[]'::jsonb
        END
      ) AS x(
        mapa text,
        palete text,
        entrega text,
        caixa text,
        area_separacao text,
        codigo_item text,
        item_descricao text,
        quantidade numeric,
        origem text,
        equipamento text,
        inicio_texto text,
        fim_texto text,
        duracao_seg numeric,
        usuario_login text,
        usuario_nome text
      )
    `
  }

  return {
    collectionId,
    count: rows.length,
  }
}

export async function saveItemFailure({ date, message }) {
  await sql`
    INSERT INTO wms_item_coletas (
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
