import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

const MAX_POSITIONS = 2500
const MAX_ASSIGNMENTS = 5000
const HISTORY_DAYS = 90
const ROUTE_DAYS = 30
const ROUTE_LIMIT = 1200

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    await ensureSchema()

    if (req.method === 'GET') {
      const [configRows, history, routes, meta] = await Promise.all([
        sql`
          SELECT layout_json, updated_at
          FROM picking_studio_config
          WHERE id = 1
          LIMIT 1
        `,
        loadHistory(),
        loadRoutes(),
        loadMeta(),
      ])

      return res.status(200).json({
        status: 'ok',
        layout: configRows[0]?.layout_json || {},
        atualizado_em: configRows[0]?.updated_at || null,
        historico: history,
        rotas: routes,
        meta,
        regras: {
          tc_fixa: true,
          dias_historico: HISTORY_DAYS,
          dias_rotas: ROUTE_DAYS,
          limite_rotas: ROUTE_LIMIT,
        },
      })
    }

    if (req.method === 'POST') {
      const action = String(req.body?.action || 'save-layout')

      if (action !== 'save-layout') {
        return res.status(400).json({
          status: 'error',
          message: 'Ação inválida.',
        })
      }

      const layout = sanitizeLayout(req.body?.layout)

      await sql`
        INSERT INTO picking_studio_config (
          id,
          layout_json,
          updated_by,
          updated_at
        )
        VALUES (
          1,
          ${JSON.stringify(layout)}::jsonb,
          ${admin.id},
          NOW()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          layout_json = EXCLUDED.layout_json,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      `

      return res.status(200).json({
        status: 'ok',
        message: 'Cenário do Picking Studio salvo.',
        atualizado_em: new Date().toISOString(),
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  } catch (error) {
    console.error('picking_studio_error', error)

    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível processar o Picking Studio.',
    })
  }
}

async function requireAdmin(req, res) {
  try {
    const usuario = await getSessionUser(req)

    if (!usuario) {
      res.status(401).json({
        status: 'error',
        message: 'Sessão não autenticada.',
      })
      return null
    }

    if (String(usuario.perfil || '').toUpperCase() !== 'ADM') {
      res.status(403).json({
        status: 'error',
        message: 'O Picking Studio é exclusivo para administradores.',
      })
      return null
    }

    return usuario
  } catch (error) {
    console.error('picking_studio_auth_error', error)
    res.status(500).json({
      status: 'error',
      message: 'Não foi possível validar seu acesso.',
    })
    return null
  }
}

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS picking_studio_config (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      layout_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

async function loadHistory() {
  try {
    const rows = await sql`
      WITH base AS (
        SELECT
          data_ref,
          NULLIF(TRIM(origem), '') AS origem,
          NULLIF(TRIM(codigo_item), '') AS codigo_item,
          NULLIF(TRIM(item_descricao), '') AS item_descricao,
          COALESCE(quantidade, 0)::numeric AS quantidade,
          NULLIF(TRIM(mapa), '') AS mapa,
          NULLIF(TRIM(palete), '') AS palete
        FROM wms_item_registros
        WHERE data_ref >= CURRENT_DATE - ${HISTORY_DAYS}::int
          AND NULLIF(TRIM(codigo_item), '') IS NOT NULL
          AND NULLIF(TRIM(origem), '') IS NOT NULL
      ),
      daily AS (
        SELECT
          data_ref,
          origem,
          codigo_item,
          MAX(item_descricao) AS item_descricao,
          SUM(quantidade) AS quantidade_dia,
          COUNT(*)::int AS acessos_dia,
          COUNT(
            DISTINCT CONCAT_WS('|', COALESCE(mapa, ''), COALESCE(palete, ''))
          )::int AS paletes_dia
        FROM base
        GROUP BY data_ref, origem, codigo_item
      )
      SELECT
        origem,
        codigo_item,
        MAX(item_descricao) AS item_descricao,
        SUM(quantidade_dia) AS quantidade,
        SUM(acessos_dia)::int AS acessos,
        SUM(paletes_dia)::int AS paletes,
        MAX(quantidade_dia) AS pico_quantidade_dia,
        MAX(paletes_dia)::int AS pico_paletes_dia,
        COUNT(DISTINCT data_ref)::int AS dias_ativos
      FROM daily
      GROUP BY origem, codigo_item
      ORDER BY SUM(acessos_dia) DESC, SUM(quantidade_dia) DESC
      LIMIT 5000
    `

    return rows.map((row) => ({
      origem: row.origem,
      sku: row.codigo_item,
      produto: row.item_descricao || row.codigo_item,
      quantidade: number(row.quantidade),
      acessos: integer(row.acessos),
      paletes: integer(row.paletes),
      pico_quantidade_dia: number(row.pico_quantidade_dia),
      pico_paletes_dia: integer(row.pico_paletes_dia),
      dias_ativos: integer(row.dias_ativos),
    }))
  } catch (error) {
    if (error?.code === '42P01') return []
    throw error
  }
}

async function loadRoutes() {
  try {
    const rows = await sql`
      WITH base AS (
        SELECT
          data_ref,
          mapa,
          palete,
          usuario_login,
          inicio_texto,
          NULLIF(TRIM(codigo_item), '') AS codigo_item,
          NULLIF(TRIM(origem), '') AS origem
        FROM wms_item_registros
        WHERE data_ref >= CURRENT_DATE - ${ROUTE_DAYS}::int
          AND NULLIF(TRIM(codigo_item), '') IS NOT NULL
          AND NULLIF(TRIM(origem), '') IS NOT NULL
          AND NULLIF(TRIM(mapa), '') IS NOT NULL
          AND NULLIF(TRIM(palete), '') IS NOT NULL
      ),
      pallets AS (
        SELECT
          data_ref,
          mapa,
          palete,
          MAX(usuario_login) AS usuario_login,
          COUNT(*)::int AS itens,
          jsonb_agg(
            jsonb_build_object(
              'sku', codigo_item,
              'origem', origem
            )
            ORDER BY inicio_texto NULLS LAST, codigo_item
          ) AS sequencia
        FROM base
        GROUP BY data_ref, mapa, palete
        ORDER BY data_ref DESC, mapa DESC, palete DESC
        LIMIT ${ROUTE_LIMIT}
      )
      SELECT *
      FROM pallets
      ORDER BY data_ref DESC, mapa DESC, palete DESC
    `

    return rows.map((row) => ({
      data: row.data_ref,
      mapa: row.mapa,
      palete: row.palete,
      usuario: row.usuario_login || null,
      itens: integer(row.itens),
      sequencia: Array.isArray(row.sequencia) ? row.sequencia : [],
    }))
  } catch (error) {
    if (error?.code === '42P01') return []
    throw error
  }
}

async function loadMeta() {
  try {
    const rows = await sql`
      SELECT
        MIN(data_ref) AS primeira_data,
        MAX(data_ref) AS ultima_data,
        COUNT(DISTINCT data_ref)::int AS dias,
        COUNT(*)::int AS registros,
        COUNT(DISTINCT NULLIF(TRIM(origem), ''))::int AS enderecos,
        COUNT(DISTINCT NULLIF(TRIM(codigo_item), ''))::int AS skus
      FROM wms_item_registros
      WHERE data_ref >= CURRENT_DATE - ${HISTORY_DAYS}::int
    `

    const row = rows[0] || {}
    return {
      primeira_data: row.primeira_data || null,
      ultima_data: row.ultima_data || null,
      dias: integer(row.dias),
      registros: integer(row.registros),
      enderecos: integer(row.enderecos),
      skus: integer(row.skus),
    }
  } catch (error) {
    if (error?.code === '42P01') {
      return {
        primeira_data: null,
        ultima_data: null,
        dias: 0,
        registros: 0,
        enderecos: 0,
        skus: 0,
      }
    }
    throw error
  }
}

function sanitizeLayout(value) {
  const layout = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}

  const positions = Array.isArray(layout.positions)
    ? layout.positions.slice(0, MAX_POSITIONS).map((position, index) => ({
        id: String(position?.id || `slot-${index + 1}`).slice(0, 80),
        address: String(position?.address || '').trim().slice(0, 100),
        x: clampInteger(position?.x, 1, 200, 1),
        y: clampInteger(position?.y, 1, 200, 1),
        enabled: position?.enabled !== false,
      }))
    : []

  const assignments = normalizeAssignments(layout.assignments)
  const baselineAssignments = normalizeAssignments(layout.baselineAssignments)

  const productSettings = {}
  if (layout.productSettings && typeof layout.productSettings === 'object') {
    Object.entries(layout.productSettings)
      .slice(0, MAX_ASSIGNMENTS)
      .forEach(([sku, settings]) => {
        productSettings[String(sku).slice(0, 100)] = {
          capacidadePlt: positiveNumber(settings?.capacidadePlt),
          travado: Boolean(settings?.travado),
        }
      })
  }

  return {
    version: 1,
    name: String(layout.name || 'Layout principal').slice(0, 120),
    rows: clampInteger(layout.rows, 8, 80, 24),
    cols: clampInteger(layout.cols, 8, 80, 32),
    metersPerCell: clampNumber(layout.metersPerCell, 0.1, 10, 1.2),
    safetyFactor: clampNumber(layout.safetyFactor, 1, 3, 1.15),
    tc: {
      x: clampInteger(layout.tc?.x, 1, 200, 29),
      y: clampInteger(layout.tc?.y, 1, 200, 18),
      w: clampInteger(layout.tc?.w, 1, 20, 3),
      h: clampInteger(layout.tc?.h, 1, 20, 4),
      label: String(layout.tc?.label || 'TC').slice(0, 40),
    },
    blockedCells: Array.isArray(layout.blockedCells)
      ? layout.blockedCells.slice(0, 5000).map((cell) => ({
          x: clampInteger(cell?.x, 1, 200, 1),
          y: clampInteger(cell?.y, 1, 200, 1),
        }))
      : [],
    positions,
    assignments,
    baselineAssignments,
    productSettings,
    updatedAt: new Date().toISOString(),
  }
}

function normalizeAssignments(value) {
  const output = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output

  Object.entries(value)
    .slice(0, MAX_ASSIGNMENTS)
    .forEach(([address, sku]) => {
      const key = String(address || '').trim().slice(0, 100)
      const normalizedSku = String(sku || '').trim().slice(0, 100)
      if (key) output[key] = normalizedSku
    })

  return output
}

function positiveNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function integer(value) {
  return Math.round(number(value))
}

function clampInteger(value, min, max, fallback) {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}
