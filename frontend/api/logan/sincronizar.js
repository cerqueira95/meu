import { getSessionUser } from '../_lib/session.js'
import { allowedTmaAdmin } from './carta.js'
import { sql, withTransaction } from './_db.js'
import { validateReportPeriod } from './_period.js'

function originAllowed(req) {
  if (String(req.headers?.['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return false
  const origin=String(req.headers?.origin || '')
  if(!origin)return true
  try {return new URL(origin).host.toLowerCase()===String(req.headers?.host||'').toLowerCase()}
  catch{return false}
}
function output(row) {
  return { id:Number(row.id),estado:row.estado,mensagem:row.mensagem||null,
    resultado:row.estado==='concluido'?row.detalhes||null:null,
    periodo:row.detalhes?.periodoSolicitado || row.detalhes?.periodo || null,
    solicitadoEm:row.solicitado_em,iniciadoEm:row.iniciado_em,concluidoEm:row.concluido_em }
}
export default async function handler(req,res){
  if (!['GET','POST'].includes(req.method)){
    res.setHeader('Allow','GET, POST')
    return res.status(405).json({message:'Método não permitido.'})
  }
  try {
    const user=await getSessionUser(req)
    if(!user)return res.status(401).json({message:'Sessão não autenticada.'})
    if(!allowedTmaAdmin(user))return res.status(403).json({message:'Acesso administrativo necessário.'})
    if(req.method==='GET'){
      const id=String(req.query?.id||'')
      if(id&&!/^\d{1,17}$/.test(id))return res.status(400).json({message:'ID inválido.'})
      if(id){
        const rows=await sql`SELECT id,estado,mensagem,detalhes,solicitado_em,iniciado_em,concluido_em
          FROM logan_coletas WHERE id=${Number(id)} LIMIT 1`
        if(!rows.length)return res.status(404).json({message:'Solicitação não encontrada.'})
        return res.status(200).json({status:'ok',...output(rows[0])})
      }
      const latest=await sql`SELECT id,estado,mensagem,detalhes,solicitado_em,iniciado_em,concluido_em
          FROM logan_coletas ORDER BY id DESC LIMIT 1`
      return res.status(200).json({
        status:'ok',preparado:true,disponivel:true,modo:'coletor_windows',
        message:'O botão envia uma solicitação ao coletor autorizado no Windows. O computador e a sessão Logan devem estar disponíveis.',
        ultimaSolicitacao:latest.length?output(latest[0]):null,
      })
    }
    if(!originAllowed(req))return res.status(403).json({message:'Origem não permitida.'})
    let periodo
    try { periodo = validateReportPeriod(req.body?.inicio, req.body?.fim) }
    catch (error) { return res.status(error.status || 400).json({message:error.message}) }
    const job=await withTransaction(async tx=>{
      await tx`UPDATE logan_coletas SET estado='erro', concluido_em=NOW(),
        mensagem='A coleta excedeu o tempo limite. Tente novamente com o coletor aberto.'
        WHERE (estado='pendente' AND solicitado_em<NOW()-INTERVAL '15 minutes')
           OR (estado='executando' AND iniciado_em<NOW()-INTERVAL '15 minutes')`
      const existing=await tx`SELECT id,estado,solicitado_em,detalhes FROM logan_coletas
        WHERE estado IN ('pendente','executando') ORDER BY id LIMIT 1`
      if(existing.length)return existing[0]
      const created=await tx`INSERT INTO logan_coletas(origem,estado,solicitado_por,mensagem,detalhes)
        VALUES('manual','pendente',${String(user.id||'')},'Aguardando coleta no Chrome autenticado.',
          ${tx.json({periodoSolicitado: periodo})})
        ON CONFLICT DO NOTHING RETURNING id,estado,solicitado_em,detalhes`
      if(created.length)return created[0]
      const concurrentlyCreated=await tx`SELECT id,estado,solicitado_em,detalhes FROM logan_coletas
        WHERE estado IN ('pendente','executando') ORDER BY id LIMIT 1`
      if(!concurrentlyCreated.length)throw Error('Não foi possível registrar a solicitação')
      return concurrentlyCreated[0]
    })
    const requested = job.detalhes?.periodoSolicitado || null
    const sameRange = requested?.dateFrom === periodo.dateFrom && requested?.dateTo === periodo.dateTo
    return res.status(202).json({status:'ok',id:Number(job.id),estado:job.estado,
      periodo: requested,
      message:!sameRange ? 'Já existe uma coleta de outro período em andamento. Aguarde antes de solicitar este intervalo.'
        : job.estado==='executando' ? 'A coleta deste intervalo já está em andamento.'
        : 'Solicitação do período selecionado recebida. Aguardando o coletor autenticado no Windows.'})
  } catch (err) {
    console.error('logan_sync_queue_error',{code:err?.code||'unknown'})
    return res.status(503).json({message:'Não foi possível consultar a fila de sincronização. Tente novamente.'})
  }
}
