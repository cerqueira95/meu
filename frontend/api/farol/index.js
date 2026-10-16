import { sql } from '../_lib/db.js'
import { getSessionUser } from '../_lib/session.js'

const ZONE = 'America/Bahia'
const MAX_DAYS = 31
const STATES = ['separacao', 'conferencia', 'carregamento', 'fechamento', 'manobrista']

function dateParam(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(value + 'T12:00:00Z')
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value
}
function bahiaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}
function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}
function kind(value) {
  const key = normalize(value)
  if (key === 'separacao') return 'separacao'
  if (key === 'conferenciaseparacao') return 'conferencia'
  if (key.includes('carregamentopalete')) return 'carregamento'
  if (key.includes('fecharcarregamento')) return 'fechamento'
  if (key.includes('manobrista')) return 'manobrista'
  return null
}
function minuteKey(text) {
  const match = String(text || '').match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  return match ? match[1] + 'T' + match[2] : null
}
function hourKey(text) {
  const minute = minuteKey(text)
  return minute ? minute.slice(0, 13) + ':00' : null
}
function inRange(moment, from, to, fromTime, toTime) {
  if (!moment) return false
  return moment >= from + 'T' + fromTime && moment <= to + 'T' + toTime
}
function operatorName(user, lookup) {
  const key = normalize(user)
  return lookup.get(key) || user || 'Sem operador identificado'
}
function increment(map, key, field, amount = 1) {
  const row = map.get(key) || { hora: key, paletes: 0, itens: 0, unidades: 0, tarefas: 0 }
  row[field] += amount
  map.set(key, row)
}
function classifyAndAggregate(palletRows, taskRows, period, lookup) {
  const hours = new Map()
  const users = new Map()
  const tasks = new Map()
  const userHours = new Map()
  function addUserHour(hour, user, field, amount = 1) {
    const key = user.id || user.nome
    if (!userHours.has(hour)) userHours.set(hour, {})
    const usersInHour = userHours.get(hour)
    const record = usersInHour[key] || { paletes: 0, itens: 0, unidades: 0, tarefas: 0 }
    record[field] += amount
    usersInHour[key] = record
  }
  let items = 0
  let units = 0
  const mapToUser = raw => {
    const id = String(raw.usuario || '').trim()
    const display = operatorName(id, lookup)
    const key = normalize(id || display) || 'sem-usuario'
    if (!users.has(key)) users.set(key, { id, nome: display, paletes: 0, itens: 0, unidades: 0, tarefas: 0, primeira: null, ultima: null })
    return users.get(key)
  }
  for (const row of palletRows) {
    const hour = hourKey(row.fim)
    if (!inRange(minuteKey(row.fim), period.inicio, period.fim, period.horaInicio, period.horaFim)) continue
    const user = mapToUser(row)
    const itemCount = Number(row.itens || 0)
    const quantity = Number(row.unidades || 0)
    user.paletes += 1
    user.itens += itemCount
    user.unidades += quantity
    const start = String(row.inicio || '')
    const finish = String(row.fim || '')
    if (start && (!user.primeira || start < user.primeira)) user.primeira = start
    if (finish && (!user.ultima || finish > user.ultima)) user.ultima = finish
    items += itemCount
    units += quantity
    increment(hours, hour, 'paletes')
    increment(hours, hour, 'itens', itemCount)
    increment(hours, hour, 'unidades', quantity)
    addUserHour(hour, user, 'paletes')
    addUserHour(hour, user, 'itens', itemCount)
    addUserHour(hour, user, 'unidades', quantity)
  }
  for (const row of taskRows) {
    const category = kind(row.tipo_nome)
    if (!category || !STATES.includes(category)) continue
    const hour = hourKey(row.data_alteracao)
    if (!inRange(minuteKey(row.data_alteracao), period.inicio, period.fim, period.horaInicio, period.horaFim)) continue
    const key = normalize(row.usuario_nome_wms) || 'sem-usuario'
    const mapped = lookup.get(key) || String(row.usuario_nome_wms || 'Sem operador identificado')
    const user = users.get(key) || { id: String(row.usuario_nome_wms || ''), nome: mapped, paletes: 0, itens: 0, unidades: 0, tarefas: 0, primeira: null, ultima: null }
    user.tarefas += 1
    users.set(key, user)
    tasks.set(category, (tasks.get(category) || 0) + 1)
    increment(hours, hour, 'tarefas')
    addUserHour(hour, user, 'tarefas')
  }
  return {
    ranking: [...users.values()].sort((a,b)=>b.paletes-a.paletes || b.tarefas-a.tarefas || a.nome.localeCompare(b.nome,'pt-BR')),
    horas: [...hours.values()].sort((a,b)=>a.hora.localeCompare(b.hora)).map(row=>({...row, byName:userHours.get(row.hora)||{}})),
    tiposTarefas: Object.fromEntries(STATES.map(k => [k, tasks.get(k) || 0])),
    resumo: {
      paletes: [...users.values()].reduce((sum,u)=>sum+u.paletes,0),
      itens: items,
      unidades: units,
      operadores: [...users.values()].filter(u=>u.paletes>0).length,
      tarefas: taskRows.filter(row => kind(row.tipo_nome) && inRange(minuteKey(row.data_alteracao),period.inicio,period.fim,period.horaInicio,period.horaFim)).length,
    },
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ message: 'Método não permitido.' })
  }
  try {
    const user = await getSessionUser(req)
    if (!user) return res.status(401).json({ message: 'Sessão expirada.' })
    if (String(user.perfil || '').toUpperCase() !== 'ADM' && !user.super_admin) {
      return res.status(403).json({ message: 'Acesso administrativo necessário.' })
    }

    const today = bahiaDate()
    const inicio = dateParam(req.query?.inicio || today)
    const fim = dateParam(req.query?.fim || today)
    const horaInicio = String(req.query?.horaInicio || '00:00')
    const horaFim = String(req.query?.horaFim || '23:59')
    const days = inicio && fim ? Math.round((Date.parse(fim+'T12:00:00Z')-Date.parse(inicio+'T12:00:00Z')) / 86400000) + 1 : 0
    if (!inicio || !fim || days < 1 || days > MAX_DAYS ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(horaInicio) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(horaFim) ||
        (inicio === fim && horaInicio > horaFim)) {
      return res.status(400).json({ message: 'Informe um período válido de até 31 dias.' })
    }
    const periodo = { inicio, fim, horaInicio, horaFim }
    const [palletRows, latestCollections, mappedUsers, tableExists] = await Promise.all([
      sql`SELECT data_ref::text AS data_ref, TRIM(usuario_login) AS usuario, TRIM(mapa) AS mapa,
                  TRIM(palete) AS palete, MIN(inicio_texto) AS inicio, MAX(fim_texto) AS fim,
                  COUNT(*)::int AS itens, COALESCE(SUM(quantidade),0)::float AS unidades
          FROM wms_item_registros
          WHERE data_ref BETWEEN ${inicio}::date AND ${fim}::date
            AND NULLIF(TRIM(mapa), '') IS NOT NULL
            AND NULLIF(TRIM(palete), '') IS NOT NULL
            AND NULLIF(TRIM(usuario_login),'') IS NOT NULL
          GROUP BY data_ref, TRIM(usuario_login), TRIM(mapa), TRIM(palete)
          LIMIT 35000`,
      sql`SELECT data_ref::text AS data, status, total_registros, coletado_em
          FROM wms_item_coletas ORDER BY data_ref DESC LIMIT 1`,
      sql`SELECT COALESCE(NULLIF(TRIM(wms_login),''),NULLIF(TRIM(matricula),'')) AS login, nome
          FROM usuarios WHERE status='ativo' AND (wms_login IS NOT NULL OR matricula IS NOT NULL)`,
      sql`SELECT to_regclass('public.wms_tarefas_registros') AS tarefas`,
    ])
    const hasTasks = Boolean(tableExists?.[0]?.tarefas)
    const taskRows = hasTasks
      ? await sql`SELECT tipo_nome, usuario_nome_wms, data_alteracao FROM wms_tarefas_registros
                   WHERE data_ref BETWEEN ${inicio}::date AND ${fim}::date AND status_id=1
                   LIMIT 25000`
      : []
    if (palletRows.length >= 35000 || taskRows.length >= 25000) {
      return res.status(422).json({message:'Período com muitos registros. Reduza o intervalo para garantir indicadores completos.'})
    }
    const lookup = new Map(mappedUsers.filter(r=>r.login).map(r=>[normalize(r.login),r.nome]))
    const analysis = classifyAndAggregate(palletRows, taskRows, periodo, lookup)
    const latest = latestCollections[0] || null
    return res.status(200).json({
      status:'ok', fonte:'WMS',
      periodo,
      ...analysis,
      qualidade: {
        ultimaColeta: latest?.coletado_em || null,
        ultimaData: latest?.data || null,
        statusColeta: latest?.status || 'não encontrada',
        tarefasDisponiveis: hasTasks,
        pontosDisponiveis: false,
        mensagemPontuacao: 'Pontuação por palete e ELA aguardam validação do relatório WMS Tempo de Separação por Palete; números não são estimados.',
        limitado: palletRows.length >= 35000 || taskRows.length >= 25000,
      },
    })
  } catch (error) {
    console.error('farol_wms_error', { code: error?.code || 'UNKNOWN' })
    return res.status(503).json({ message:'Não foi possível carregar o Farol do WMS. Tente novamente.' })
  }
}
