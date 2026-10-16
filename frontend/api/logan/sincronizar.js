import { getSessionUser } from '../_lib/session.js'
import { allowedTmaAdmin } from './carta.js'
import { collectorConfigured, synchronizeLogan } from './_sync.js'

function allowedOrigin(req) {
  const site = String(req.headers?.['sec-fetch-site'] || '').toLowerCase()
  if (site === 'cross-site') return false
  const origin = String(req.headers?.origin || '')
  if (!origin) return true
  try { return new URL(origin).host.toLowerCase() === String(req.headers?.host || '').toLowerCase() }
  catch { return false }
}
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ message: 'Método não permitido.' })
  }
  try {
    const user = await getSessionUser(req)
    if (!user) return res.status(401).json({ message: 'Sessão não autenticada.' })
    if (!allowedTmaAdmin(user)) return res.status(403).json({ message: 'Acesso restrito ao administrador.' })
    if (req.method === 'GET') return res.status(200).json({
      status: 'ok', preparado: true, disponivel: collectorConfigured(),
      message: collectorConfigured()
        ? 'Coletor autenticado configurado. A sincronização manual pode ser executada.'
        : 'A captura autenticada do Logan ainda não está conectada. O botão não consegue buscar relatórios novos.',
    })
    if (!allowedOrigin(req)) return res.status(403).json({ message: 'Origem não autorizada.' })
    const result = await synchronizeLogan()
    return res.status(200).json({
      status: 'ok',
      message: result.inseridos
        ? 'Novos registros recebidos do Logan sem duplicar os já existentes.'
        : 'Os relatórios foram consultados e não há registros novos.',
      ...result,
    })
  } catch (error) {
    if (error?.status === 424 || error?.status === 409 || error?.status === 502) {
      return res.status(error.status).json({ status: 'error', message: error.message })
    }
    console.error('logan_manual_sync_error', { code: error?.code || 'unknown' })
    return res.status(503).json({ status: 'error', message: 'Falha ao sincronizar o Logan. Verifique a integração e tente novamente.' })
  }
}
