import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

const FUNCTIONS = ['Operador', 'Ajudante', 'Conferente', 'Manobrista']
const PERIODS = new Set(['dia', 'semana', 'mes'])

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS operacao_destaques (
      id BIGSERIAL PRIMARY KEY,
      usuario_id BIGINT NOT NULL,
      funcao VARCHAR(40) NOT NULL,
      periodo_tipo VARCHAR(20) NOT NULL,
      data_inicio DATE NOT NULL,
      data_fim DATE NOT NULL,
      motivo TEXT NOT NULL,
      criado_por_id BIGINT NOT NULL,
      criado_por_nome VARCHAR(180) NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (funcao, periodo_tipo, data_inicio, data_fim)
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_operacao_destaques_usuario
    ON operacao_destaques(usuario_id, data_inicio DESC)
  `
}

export default async function handler(req, res) {
  const currentUser = await getSessionUser(req)
  if (!currentUser) {
    return res.status(401).json({ status: 'error', message: 'Sessão não autenticada.' })
  }

  try {
    await ensureSchema()

    if (req.method === 'GET') {
      const destaques = await sql`
        SELECT
          d.id,
          d.usuario_id,
          d.funcao,
          d.periodo_tipo,
          d.data_inicio,
          d.data_fim,
          d.motivo,
          d.criado_em,
          u.nome,
          u.foto_perfil,
          u.cargo,
          u.turno,
          (
            SELECT COUNT(*)::int
            FROM operacao_destaques x
            WHERE x.usuario_id = d.usuario_id
          ) AS estrelas
        FROM operacao_destaques d
        INNER JOIN usuarios u ON u.id = d.usuario_id
        ORDER BY d.data_inicio DESC, d.funcao
        LIMIT 120
      `

      const myRows = await sql`
        SELECT id, funcao, periodo_tipo, data_inicio, data_fim, motivo, criado_em
        FROM operacao_destaques
        WHERE usuario_id = ${currentUser.id}
        ORDER BY data_inicio DESC, id DESC
      `

      let candidatos = []
      if (String(currentUser.perfil || '').toUpperCase() === 'ADM') {
        const users = await sql`
          SELECT id, nome, cargo, perfil, turno, foto_perfil
          FROM usuarios
          WHERE status = 'ativo'
          ORDER BY nome
        `

        candidatos = users
          .map((user) => ({ ...user, funcao_destaque: classifyFunction(user) }))
          .filter((user) => FUNCTIONS.includes(user.funcao_destaque))
          .map((user) => ({
            id: Number(user.id),
            nome: user.nome,
            cargo: user.cargo || '',
            perfil: user.perfil || '',
            turno: user.turno || '',
            foto_perfil: user.foto_perfil || null,
            funcao_destaque: user.funcao_destaque,
          }))
      }

      return res.status(200).json({
        status: 'ok',
        funcoes: FUNCTIONS,
        destaques: destaques.map(serializeHighlight),
        minhas_estrelas: myRows.length,
        meus_destaques: myRows.map((row) => ({
          id: Number(row.id),
          funcao: row.funcao,
          periodo_tipo: row.periodo_tipo,
          data_inicio: row.data_inicio,
          data_fim: row.data_fim,
          motivo: row.motivo,
          criado_em: row.criado_em,
        })),
        candidatos,
      })
    }

    if (req.method === 'POST') {
      if (String(currentUser.perfil || '').toUpperCase() !== 'ADM') {
        return res.status(403).json({ status: 'error', message: 'Apenas administradores podem gerenciar destaques.' })
      }

      const action = String(req.body?.action || 'save').trim().toLowerCase()

      if (action === 'delete') {
        const id = Number(req.body?.id || 0)
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ status: 'error', message: 'Destaque inválido.' })
        }
        await sql`DELETE FROM operacao_destaques WHERE id = ${id}`
        return res.status(200).json({ status: 'ok', message: 'Destaque removido.' })
      }

      const usuarioId = Number(req.body?.usuario_id || 0)
      const funcao = normalizeFunction(req.body?.funcao)
      const periodoTipo = String(req.body?.periodo_tipo || '').trim().toLowerCase()
      const dataBase = String(req.body?.data_base || '').trim()
      const motivo = String(req.body?.motivo || '').trim()

      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return res.status(400).json({ status: 'error', message: 'Selecione um colaborador.' })
      }
      if (!FUNCTIONS.includes(funcao)) {
        return res.status(400).json({ status: 'error', message: 'Selecione uma função válida.' })
      }
      if (!PERIODS.has(periodoTipo)) {
        return res.status(400).json({ status: 'error', message: 'Selecione dia, semana ou mês.' })
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataBase)) {
        return res.status(400).json({ status: 'error', message: 'Informe uma data válida.' })
      }
      if (motivo.length < 5) {
        return res.status(400).json({ status: 'error', message: 'Explique por que essa pessoa foi destaque.' })
      }

      const users = await sql`
        SELECT id, nome, cargo, perfil, status
        FROM usuarios
        WHERE id = ${usuarioId}
        LIMIT 1
      `
      const target = users[0]
      if (!target || target.status !== 'ativo') {
        return res.status(404).json({ status: 'error', message: 'Colaborador não encontrado ou inativo.' })
      }
      if (classifyFunction(target) !== funcao) {
        return res.status(400).json({
          status: 'error',
          message: 'O colaborador selecionado não pertence à função escolhida.',
        })
      }

      const { start, end } = resolvePeriod(periodoTipo, dataBase)

      await sql`
        INSERT INTO operacao_destaques (
          usuario_id, funcao, periodo_tipo, data_inicio, data_fim,
          motivo, criado_por_id, criado_por_nome, atualizado_em
        )
        VALUES (
          ${usuarioId}, ${funcao}, ${periodoTipo}, ${start}, ${end},
          ${motivo}, ${currentUser.id}, ${currentUser.nome}, NOW()
        )
        ON CONFLICT (funcao, periodo_tipo, data_inicio, data_fim)
        DO UPDATE SET
          usuario_id = EXCLUDED.usuario_id,
          motivo = EXCLUDED.motivo,
          criado_por_id = EXCLUDED.criado_por_id,
          criado_por_nome = EXCLUDED.criado_por_nome,
          atualizado_em = NOW()
      `

      return res.status(200).json({
        status: 'ok',
        message: `${target.nome} recebeu uma estrela como destaque de ${funcao}.`,
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' })
  } catch (error) {
    console.error('highlights_error', error)
    return res.status(500).json({ status: 'error', message: 'Não foi possível processar os destaques.' })
  }
}

function classifyFunction(user) {
  const perfil = String(user.perfil || '').trim().toUpperCase()
  const cargo = String(user.cargo || '').trim().toUpperCase()

  if (cargo.includes('MANOBRISTA')) return 'Manobrista'
  if (perfil === 'CONFERENTE' || cargo.includes('CONFERENTE')) return 'Conferente'
  if (perfil === 'AJUDANTE' || cargo.includes('AJUDANTE') || cargo.includes('AUXILIAR')) return 'Ajudante'
  if (perfil === 'OPERADOR' || cargo.includes('OPERADOR') || cargo.includes('EMPILHADEIRA')) return 'Operador'
  return ''
}

function normalizeFunction(value) {
  const text = String(value || '').trim().toLowerCase()
  return FUNCTIONS.find((item) => item.toLowerCase() === text) || ''
}

function resolvePeriod(type, base) {
  const date = new Date(base + 'T12:00:00Z')
  if (type === 'dia') return { start: base, end: base }

  if (type === 'semana') {
    const day = date.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    const startDate = new Date(date)
    startDate.setUTCDate(startDate.getUTCDate() + diff)
    const endDate = new Date(startDate)
    endDate.setUTCDate(endDate.getUTCDate() + 6)
    return { start: isoDate(startDate), end: isoDate(endDate) }
  }

  const startDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const endDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
  return { start: isoDate(startDate), end: isoDate(endDate) }
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

function serializeHighlight(row) {
  return {
    id: Number(row.id),
    usuario_id: Number(row.usuario_id),
    funcao: row.funcao,
    periodo_tipo: row.periodo_tipo,
    data_inicio: row.data_inicio,
    data_fim: row.data_fim,
    motivo: row.motivo,
    criado_em: row.criado_em,
    nome: row.nome,
    foto_perfil: row.foto_perfil || null,
    cargo: row.cargo || '',
    turno: row.turno || '',
    estrelas: Number(row.estrelas || 0),
  }
}
