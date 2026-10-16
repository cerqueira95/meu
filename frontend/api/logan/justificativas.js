import { ensureJustificativasSchema } from './_schema.js'
import { getSessionUser } from '../_lib/session.js'
import { sql, withTransaction } from '../_lib/db.js'
import { allowedTmaAdmin } from './carta.js'
import { readCartaReport } from './_data.js'

const safeDoc = value => String(value ?? '').trim()
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ message: 'Método não permitido.' })
  }
  try {
    const user = await getSessionUser(req)
    if (!user) return res.status(401).json({ message: 'Sessão não autenticada.' })
    if (!allowedTmaAdmin(user)) return res.status(403).json({ message: 'Acesso administrativo necessário.' })
    await ensureJustificativasSchema()
    const doc = safeDoc(req.method === 'GET' ? req.query?.documento : req.body?.documento)
    if (!doc || doc.length > 120) return res.status(400).json({ message: 'Documento de transporte inválido.' })
    if (req.method === 'GET') {
      const [atual, historico] = await Promise.all([
        sql`SELECT documento_de_transporte, justificativa, usuario_nome, criado_em, atualizado_em
            FROM logan_tma_justificativas WHERE documento_de_transporte = ${doc} LIMIT 1`,
        sql`SELECT tipo_evento, justificativa_anterior, justificativa, usuario_nome, criado_em
            FROM logan_tma_justificativas_historico
            WHERE documento_de_transporte = ${doc} ORDER BY id DESC LIMIT 100`,
      ])
      return res.status(200).json({ status: 'ok', atual: atual[0] || null, historico })
    }
    if (String(req.headers?.['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
      return res.status(403).json({ message: 'Origem não permitida.' })
    }
    const origem = String(req.headers?.origin || '')
    if (origem) {
      const host = String(req.headers?.host || '')
      let match = false
      try { match = new URL(origem).host.toLowerCase() === host.toLowerCase() } catch {}
      if (!match) return res.status(403).json({ message: 'Origem não permitida.' })
    }
    const justificativa = String(req.body?.justificativa ?? '').trim()
    if (justificativa.length < 5 || justificativa.length > 3000) {
      return res.status(400).json({ message: 'Justificativa deve ter entre 5 e 3000 caracteres.' })
    }
    const report = await readCartaReport()
    const linha = report.detalhes.find(row => row.documento === doc && row.acimaMeta)
    if (!linha) {
      return res.status(422).json({ message: 'Justificativa permitida somente para TMA finalizado acima de duas horas.' })
    }
    const userId = String(user.id)
    const nome = String(user.nome || 'Usuário não identificado')
    const result = await withTransaction(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${doc}))`
      const rows = await tx`SELECT id, justificativa FROM logan_tma_justificativas
                            WHERE documento_de_transporte = ${doc} FOR UPDATE`
      const old = rows[0] || null
      if (old?.justificativa === justificativa) return { alterada: false }
      let id
      let evento
      if (old) {
        await tx`UPDATE logan_tma_justificativas
           SET justificativa = ${justificativa}, usuario_id = ${userId}, usuario_nome = ${nome}, atualizado_em = NOW()
           WHERE id = ${old.id}`
        id = old.id
        evento = 'EDICAO'
      } else {
        const nova = await tx`INSERT INTO logan_tma_justificativas
          (documento_de_transporte, justificativa, usuario_id, usuario_nome)
          VALUES (${doc}, ${justificativa}, ${userId}, ${nome}) RETURNING id`
        id = nova[0].id
        evento = 'CRIACAO'
      }
      await tx`INSERT INTO logan_tma_justificativas_historico
        (justificativa_id, documento_de_transporte, tipo_evento, justificativa_anterior, justificativa, usuario_id, usuario_nome)
        VALUES (${id}, ${doc}, ${evento}, ${old?.justificativa || null}, ${justificativa}, ${userId}, ${nome})`
      return { alterada: true }
    })
    return res.status(200).json({ status: 'ok', ...result })
  } catch (error) {
    console.error('logan_justificativas_error', { code: error?.code || null, message: error?.message || 'unknown' })
    return res.status(503).json({ message: 'Não foi possível acessar as justificativas do TMA.' })
  }
}
