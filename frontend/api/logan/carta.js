import { ensureJustificativasSchema } from './_schema.js'
import { getSessionUser } from '../_lib/session.js'
import { sql } from '../_lib/db.js'
import { readCartaReport } from './_data.js'

const dateOk = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
export const allowedTmaAdmin = user => Boolean(
  user && (user.super_admin || user.empresa_admin || String(user.perfil || '').toUpperCase() === 'ADM')
)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ message: 'Método não permitido.' })
  }
  try {
    const user = await getSessionUser(req)
    if (!user) return res.status(401).json({ message: 'Sessão não autenticada.' })
    if (!allowedTmaAdmin(user)) return res.status(403).json({ message: 'Acesso administrativo necessário.' })
    await ensureJustificativasSchema()
    const inicio = String(req.query?.inicio || '').trim()
    const fim = String(req.query?.fim || '').trim()
    const turno = String(req.query?.turno || '').toUpperCase()
    if (!dateOk(inicio) || !dateOk(fim) || inicio > fim || !['', 'A', 'B', 'C'].includes(turno)) {
      return res.status(400).json({ message: 'Filtros inválidos.' })
    }
    const result = await readCartaReport({ inicio, fim, turno })
    const docs = result.detalhes.map(row => row.documento)
    const just = docs.length
      ? await sql`SELECT documento_de_transporte, justificativa, usuario_nome, atualizado_em
          FROM logan_tma_justificativas WHERE documento_de_transporte = ANY(${docs})`
      : []
    const byDoc = new Map(just.map(row => [row.documento_de_transporte, row]))
    const detalhes = result.detalhes.map(row => ({
      ...row,
      justificativa: byDoc.get(row.documento)?.justificativa || '',
      justificativaUsuario: byDoc.get(row.documento)?.usuario_nome || '',
      justificativaAtualizadaEm: byDoc.get(row.documento)?.atualizado_em || null,
    }))
    return res.status(200).json({
      status: 'ok', ...result, detalhes,
      semJustificativa: detalhes.filter(row => row.acimaMeta && !row.justificativa).length,
      provisorio: true,
      fonte: 'Dados importados; exportação automática do Logan ainda não ativada',
    })
  } catch (error) {
    console.error('logan_carta_error', { code: error?.code || null, message: error?.message || 'unknown' })
    return res.status(503).json({ message: 'Carta Controle indisponível. Verifique a integração Logan.' })
  }
}
