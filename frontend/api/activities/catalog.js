import { getSessionUser } from '../_lib/session.js'
import {
  ensureActivitiesSchema,
  getActivityConfig,
} from '../_lib/activities.js'

const ALLOWED_PROFILES = new Set(['AJUDANTE', 'ADM'])

const SEPARATION_KEYS = [
  'separacao_marketing',
  'separacao_shelf_life',
  'separacao_armazenagem_chopp',
  'separacao_chopp',
  'separacao_triagem_repack',
  'separacao_pre_picking',
  'separacao_transferencia',
]

const RETORNO_KEYS = [
  'retorno_rota_molho_ag',
  'retorno_rota_devolucao',
  'retorno_rota_troca',
  'retorno_rota_chapatex',
]

const REPACK_KEYS = [
  'repack_gfa_vidro',
  'repack_lata',
  'repack_long_neck',
  'repack_pet',
  'repack_destilado',
  'repack_agua',
  'repack_ow',
  'repack_bib',
]

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      status: 'error',
      message: 'Método não permitido.',
    })
  }

  try {
    const usuario = await getSessionUser(req)

    if (!usuario) {
      return res.status(401).json({
        status: 'error',
        message: 'Sessão não autenticada.',
      })
    }

    if (!ALLOWED_PROFILES.has(String(usuario.perfil || '').toUpperCase())) {
      return res.status(403).json({
        status: 'error',
        message: 'O módulo de atividades está disponível para Ajudantes e administradores.',
      })
    }

    await ensureActivitiesSchema()

    const [
      fiveS,
      amarracao,
      selo,
      integralizacao,
      separationConfigs,
      retornoConfigs,
      repackConfigs,
    ] = await Promise.all([
      getActivityConfig('5s', usuario.id),
      getActivityConfig('amarracao', usuario.id),
      getActivityConfig('selo_vermelho', usuario.id),
      getActivityConfig('integralizacao_devolucao', usuario.id),
      Promise.all(
        SEPARATION_KEYS.map((chave) => getActivityConfig(chave, usuario.id)),
      ),
      Promise.all(
        RETORNO_KEYS.map((chave) => getActivityConfig(chave, usuario.id)),
      ),
      Promise.all(
        REPACK_KEYS.map((chave) => getActivityConfig(chave, usuario.id)),
      ),
    ])

    const atividades = []

    if (fiveS?.ativo) {
      atividades.push({
        chave: '5s',
        nome: '5S',
        descricao: 'Registre a área executada e a evidência.',
        rota: '/api/activities/5s',
        valor_unitario: Number(fiveS.valor_unitario || 0),
      })
    }

    if (amarracao?.ativo) {
      atividades.push({
        chave: 'amarracao',
        nome: 'Amarração',
        descricao: 'Mapa/OP, placa, ajudante e evidência.',
        rota: '/api/activities/amarracao',
        valor_unitario: Number(amarracao.valor_unitario || 0),
      })
    }

    if (selo?.ativo) {
      atividades.push({
        chave: 'selo_vermelho',
        nome: 'Selo Vermelho',
        descricao: 'Retrabalho por embalagem, PLTs e anomalia.',
        rota: '/api/activities/selo-vermelho',
        valor_unitario: Number(selo.valor_unitario || 0),
      })
    }

    const activeSeparation = separationConfigs.filter((item) => item?.ativo)
    if (activeSeparation.length > 0) {
      atividades.push({
        chave: 'separacao',
        nome: 'Separação',
        descricao: 'Marketing, Despejo, CHOPP, Pré-Picking, Repack e Transferência.',
        rota: '/api/activities/separacao',
        tipos_ativos: activeSeparation.length,
      })
    }

    const activeRetorno = retornoConfigs.filter((item) => item?.ativo)
    if (activeRetorno.length > 0) {
      atividades.push({
        chave: 'retorno_rota',
        nome: 'Retorno de Rota',
        descricao: 'Molho AG, Devolução, Troca e Separação de Chapatex.',
        rota: '/api/activities/retorno-rota',
        tipos_ativos: activeRetorno.length,
      })
    }

    if (integralizacao?.ativo) {
      atividades.push({
        chave: 'integralizacao_devolucao',
        nome: 'Integralização da Devolução',
        descricao: 'Confirme a integralização, participantes e evidência.',
        rota: '/api/activities/integralizacao-devolucao',
        valor_unitario: Number(integralizacao.valor_unitario || 0),
      })
    }

    const activeRepack = repackConfigs.filter((item) => item?.ativo)
    if (activeRepack.length > 0) {
      atividades.push({
        chave: 'repack',
        nome: 'Repack',
        descricao: 'SKU recuperado, quantidade de caixas e evidência.',
        rota: '/api/activities/repack',
        tipos_ativos: activeRepack.length,
      })
    }

    return res.status(200).json({
      status: 'ok',
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        turno: usuario.turno || '',
        perfil: usuario.perfil || '',
      },
      atividades,
    })
  } catch (error) {
    console.error('activities_catalog_error', error)
    return res.status(500).json({
      status: 'error',
      message: 'Não foi possível carregar as atividades disponíveis.',
    })
  }
}
