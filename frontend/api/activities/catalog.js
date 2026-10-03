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

    const [fiveS, amarracao, selo, separationConfigs] = await Promise.all([
      getActivityConfig('5s', usuario.id),
      getActivityConfig('amarracao', usuario.id),
      getActivityConfig('selo_vermelho', usuario.id),
      Promise.all(
        SEPARATION_KEYS.map((chave) => getActivityConfig(chave, usuario.id)),
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
        descricao: 'Escolha o tipo e lance somente os campos necessários.',
        rota: '/api/activities/separacao',
        tipos_ativos: activeSeparation.length,
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
