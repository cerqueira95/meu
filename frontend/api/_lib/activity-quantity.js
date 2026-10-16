// Recupera quantidades antigas sem alterar lançamentos ou aprovações.
// O valor unitário continua sendo o registrado no lançamento de cada participante.
function positiveQuantity(value) {
  if (value === null || value === undefined || value === '') return null
  const normalized = typeof value === 'string'
    ? value.trim().replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
    : value
  const number = Number(normalized)
  return Number.isFinite(number) && number > 0 && number <= 10000000 ? number : null
}

function sumDetails(items, field) {
  if (!Array.isArray(items)) return null
  const values = items.map((item) => positiveQuantity(item?.[field]))
  return values.length && values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null
}

function sumMatches(text, expression) {
  const matches = [...String(text || '').matchAll(expression)]
  if (!matches.length) return null
  const values = matches.map((match) => positiveQuantity(match[1]))
  return values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null
}

function quantityFromLabels(items, pattern) {
  if (!Array.isArray(items) || !items.length) return null
  const values = items.map((item) => {
    const name = typeof item === 'string' ? item : item?.opcao_nome
    return sumMatches(name, pattern)
  })
  return values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null
}

export function resolveActivityQuantityInfo(batch = {}) {
  let details = batch.detalhes || {}
  if (typeof details === 'string') {
    try { details = JSON.parse(details) } catch { details = {} }
  }
  if (!details || typeof details !== 'object') details = {}

  const items = Array.isArray(batch.itens) ? batch.itens : []
  const key = String(batch.atividade_chave || '').toLowerCase()
  const explicit = positiveQuantity(details.quantidade_calculo)
  if (explicit !== null) {
    return { quantidade: explicit, origem: 'quantidade_calculo', conferir: false }
  }

  if (key === 'selo_vermelho') {
    const total = positiveQuantity(details.total_plts) || positiveQuantity(details.quantidade_plts)
    if (total !== null) return { quantidade: total, origem: 'total_plts', conferir: false }

    const detailed = sumDetails(details.itens, 'quantidade_plts')
    if (detailed !== null) return { quantidade: detailed, origem: 'detalhes.itens', conferir: false }

    // Exemplos legados: "PET • 15 PLT(s)" e "Item 1: PET • 15 PLTs".
    const pattern = /(\d[\d.,]*)\s*PLT(?:s|\(s\))?\b/gi
    const labels = quantityFromLabels(items, pattern)
    if (labels !== null) return { quantidade: labels, origem: 'itens.opcao_nome', conferir: false }

    const observation = sumMatches(batch.observacao, pattern)
    if (observation !== null) return { quantidade: observation, origem: 'observacao', conferir: false }
  }

  if (key === 'repack' || key.startsWith('repack_')) {
    const total = positiveQuantity(details.quantidade_caixas) || positiveQuantity(details.quantidade)
    if (total !== null) return { quantidade: total, origem: 'quantidade_caixas', conferir: false }

    const pattern = /(\d[\d.,]*)\s*caixas?(?:\(s\))?\b/gi
    const labels = quantityFromLabels(items, pattern)
    if (labels !== null) return { quantidade: labels, origem: 'itens.opcao_nome', conferir: false }

    const observation = sumMatches(batch.observacao, pattern)
    if (observation !== null) return { quantidade: observation, origem: 'observacao', conferir: false }
  }

  return {
    quantidade: Math.max(items.length, 1),
    origem: 'contagem_itens',
    conferir: key === 'selo_vermelho' || key === 'repack' || key.startsWith('repack_'),
  }
}

export function resolveActivityQuantity(batch = {}) {
  return resolveActivityQuantityInfo(batch).quantidade
}
