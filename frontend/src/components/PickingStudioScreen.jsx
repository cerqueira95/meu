import { useMemo, useState, useEffect } from 'react'
import { api } from '../services/api.js'
import './PickingStudioScreen.css'

const DEFAULT_COLS = 32
const DEFAULT_ROWS = 24
const DEFAULT_METERS_PER_CELL = 1.2
const DEFAULT_SAFETY_FACTOR = 1.15

const TABS = [
  { id: 'mapa', label: 'Mapa físico' },
  { id: 'slotting', label: 'Slotting' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'simulacao', label: 'Simulação' },
]

function naturalCompare(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  })
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function integer(value) {
  return Math.round(number(value))
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number(value))
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

function cellKey(x, y) {
  return String(x) + ':' + String(y)
}

function positionKey(position) {
  return cellKey(position.x, position.y)
}

function getTcCenter(tc) {
  return {
    x: Math.round(number(tc.x) + (number(tc.w) - 1) / 2),
    y: Math.round(number(tc.y) + (number(tc.h) - 1) / 2),
  }
}

function isInsideTc(x, y, tc) {
  return (
    x >= number(tc.x) &&
    x <= number(tc.x) + number(tc.w) - 1 &&
    y >= number(tc.y) &&
    y <= number(tc.y) + number(tc.h) - 1
  )
}

function manhattan(a, b) {
  return Math.abs(number(a.x) - number(b.x)) + Math.abs(number(a.y) - number(b.y))
}

function normalizeLayout(layout = {}) {
  const rows = clamp(integer(layout.rows || DEFAULT_ROWS), 8, 80)
  const cols = clamp(integer(layout.cols || DEFAULT_COLS), 8, 80)
  const tc = {
    x: clamp(integer(layout.tc?.x || cols - 2), 1, cols),
    y: clamp(integer(layout.tc?.y || rows - 4), 1, rows),
    w: clamp(integer(layout.tc?.w || 3), 1, Math.max(1, cols)),
    h: clamp(integer(layout.tc?.h || 4), 1, Math.max(1, rows)),
    label: String(layout.tc?.label || 'TC'),
  }

  tc.w = Math.min(tc.w, cols - tc.x + 1)
  tc.h = Math.min(tc.h, rows - tc.y + 1)

  return {
    version: 1,
    name: String(layout.name || 'Layout principal'),
    rows,
    cols,
    metersPerCell: clamp(number(layout.metersPerCell || DEFAULT_METERS_PER_CELL), 0.1, 10),
    safetyFactor: clamp(number(layout.safetyFactor || DEFAULT_SAFETY_FACTOR), 1, 3),
    tc,
    blockedCells: Array.isArray(layout.blockedCells) ? layout.blockedCells : [],
    positions: Array.isArray(layout.positions) ? layout.positions : [],
    assignments: layout.assignments && typeof layout.assignments === 'object'
      ? layout.assignments
      : {},
    baselineAssignments: layout.baselineAssignments && typeof layout.baselineAssignments === 'object'
      ? layout.baselineAssignments
      : {},
    productSettings: layout.productSettings && typeof layout.productSettings === 'object'
      ? layout.productSettings
      : {},
  }
}

function buildWmsBaseline(history) {
  const bestByOrigin = new Map()

  for (const row of history || []) {
    const origin = String(row.origem || '').trim()
    const sku = String(row.sku || '').trim()
    if (!origin || !sku) continue

    const score = number(row.acessos) * 1000000 + number(row.quantidade)
    const current = bestByOrigin.get(origin)

    if (!current || score > current.score) {
      bestByOrigin.set(origin, { sku, score })
    }
  }

  return Object.fromEntries(
    [...bestByOrigin.entries()].map(([origin, item]) => [origin, item.sku]),
  )
}

function buildPositionsFromHistory(history, existingLayout) {
  const layout = normalizeLayout(existingLayout)
  const origins = [...new Set(
    (history || [])
      .map((row) => String(row.origem || '').trim())
      .filter(Boolean),
  )].sort(naturalCompare)

  if (!origins.length) {
    return {
      ...layout,
      positions: layout.positions || [],
    }
  }

  const existingByAddress = new Map(
    (layout.positions || []).map((position) => [position.address, position]),
  )

  const cols = Math.max(layout.cols, DEFAULT_COLS)
  const usableCols = Math.max(4, cols - 4)
  const neededRows = Math.max(
    layout.rows,
    Math.ceil(origins.length / usableCols) + 2,
    DEFAULT_ROWS,
  )

  const occupied = new Set(
    (layout.positions || []).map((position) => positionKey(position)),
  )

  const positions = [...(layout.positions || [])]

  function findFreeCell(indexHint) {
    for (let offset = 0; offset < usableCols * neededRows; offset += 1) {
      const index = (indexHint + offset) % (usableCols * neededRows)
      const row = Math.floor(index / usableCols) + 1
      let col = (index % usableCols) + 1
      if (row % 2 === 0) col = usableCols - col + 1
      const key = cellKey(col, row)

      if (!occupied.has(key) && !isInsideTc(col, row, layout.tc)) {
        occupied.add(key)
        return { x: col, y: row }
      }
    }

    return { x: 1, y: 1 }
  }

  origins.forEach((origin, index) => {
    if (existingByAddress.has(origin)) return
    const free = findFreeCell(index)
    positions.push({
      id: 'slot-' + origin.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 50),
      address: origin,
      x: free.x,
      y: free.y,
      enabled: true,
    })
  })

  return {
    ...layout,
    cols,
    rows: Math.min(80, neededRows),
    positions,
  }
}

function aggregateProducts(history) {
  const products = new Map()

  for (const row of history || []) {
    const sku = String(row.sku || '').trim()
    if (!sku) continue

    const current = products.get(sku) || {
      sku,
      produto: row.produto || sku,
      quantidade: 0,
      acessos: 0,
      paletes: 0,
      picoQuantidadeDia: 0,
      picoPaletesDia: 0,
      diasAtivos: 0,
      origens: new Set(),
    }

    current.produto = current.produto || row.produto || sku
    current.quantidade += number(row.quantidade)
    current.acessos += integer(row.acessos)
    current.paletes += integer(row.paletes)
    current.picoQuantidadeDia = Math.max(
      current.picoQuantidadeDia,
      number(row.pico_quantidade_dia),
    )
    current.picoPaletesDia = Math.max(
      current.picoPaletesDia,
      integer(row.pico_paletes_dia),
    )
    current.diasAtivos = Math.max(current.diasAtivos, integer(row.dias_ativos))
    current.origens.add(String(row.origem || ''))

    products.set(sku, current)
  }

  return [...products.values()]
    .map((item) => ({
      ...item,
      origens: [...item.origens].filter(Boolean),
    }))
    .sort((a, b) => b.acessos - a.acessos || naturalCompare(a.sku, b.sku))
}

function shortestSteps(start, end, layout, cache) {
  const directKey =
    cellKey(start.x, start.y) + '>' + cellKey(end.x, end.y) + ':' + layout.blockedCells.length
  const reverseKey =
    cellKey(end.x, end.y) + '>' + cellKey(start.x, start.y) + ':' + layout.blockedCells.length

  if (cache.has(directKey)) return cache.get(directKey)
  if (cache.has(reverseKey)) return cache.get(reverseKey)

  if (!layout.blockedCells.length) {
    const result = manhattan(start, end)
    cache.set(directKey, result)
    return result
  }

  const blocked = new Set(
    layout.blockedCells.map((cell) => cellKey(integer(cell.x), integer(cell.y))),
  )
  blocked.delete(cellKey(start.x, start.y))
  blocked.delete(cellKey(end.x, end.y))

  const queue = [[integer(start.x), integer(start.y), 0]]
  const visited = new Set([cellKey(start.x, start.y)])
  let cursor = 0

  while (cursor < queue.length) {
    const [x, y, distance] = queue[cursor]
    cursor += 1

    if (x === integer(end.x) && y === integer(end.y)) {
      cache.set(directKey, distance)
      return distance
    }

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]

    for (const [nextX, nextY] of neighbors) {
      if (
        nextX < 1 ||
        nextY < 1 ||
        nextX > layout.cols ||
        nextY > layout.rows
      ) {
        continue
      }

      const key = cellKey(nextX, nextY)
      if (blocked.has(key) || visited.has(key)) continue
      visited.add(key)
      queue.push([nextX, nextY, distance + 1])
    }
  }

  const fallback = manhattan(start, end)
  cache.set(directKey, fallback)
  return fallback
}

function buildSkuPositions(positions, assignments) {
  const output = new Map()

  for (const position of positions) {
    if (position.enabled === false) continue
    const sku = String(assignments[position.address] || '').trim()
    if (!sku) continue
    if (!output.has(sku)) output.set(sku, [])
    output.get(sku).push(position)
  }

  return output
}

function simulateRoutes(routes, layout, assignments) {
  const skuPositions = buildSkuPositions(layout.positions, assignments)
  const tcPoint = getTcCenter(layout.tc)
  const cache = new Map()
  let totalSteps = 0
  let missingSkus = 0
  const details = []

  for (const route of routes || []) {
    let current = tcPoint
    let steps = 0
    const visitedSku = new Set()
    let routeMissing = 0

    for (const item of route.sequencia || []) {
      const sku = String(item?.sku || '').trim()
      if (!sku || visitedSku.has(sku)) continue
      visitedSku.add(sku)

      const candidates = skuPositions.get(sku) || []
      if (!candidates.length) {
        routeMissing += 1
        missingSkus += 1
        continue
      }

      let best = candidates[0]
      let bestDistance = shortestSteps(current, best, layout, cache)

      for (let index = 1; index < candidates.length; index += 1) {
        const candidate = candidates[index]
        const distance = shortestSteps(current, candidate, layout, cache)
        if (distance < bestDistance) {
          best = candidate
          bestDistance = distance
        }
      }

      steps += bestDistance
      current = best
    }

    steps += shortestSteps(current, tcPoint, layout, cache)
    totalSteps += steps

    details.push({
      key: String(route.data || '') + '-' + String(route.mapa || '') + '-' + String(route.palete || ''),
      data: route.data,
      mapa: route.mapa,
      palete: route.palete,
      usuario: route.usuario,
      itens: route.itens,
      steps,
      meters: steps * layout.metersPerCell,
      missing: routeMissing,
    })
  }

  return {
    routes: details.length,
    totalMeters: totalSteps * layout.metersPerCell,
    averageMeters: details.length
      ? (totalSteps * layout.metersPerCell) / details.length
      : 0,
    missingSkus,
    details,
  }
}

function optimizeAssignments(layout, assignments, productsBySku, productSettings) {
  const result = { ...assignments }
  const tc = getTcCenter(layout.tc)

  const slotCounts = new Map()
  Object.values(assignments).forEach((sku) => {
    const key = String(sku || '').trim()
    if (!key) return
    slotCounts.set(key, (slotCounts.get(key) || 0) + 1)
  })

  const lockedPositions = new Set()
  const lockedSkuCounts = new Map()

  for (const position of layout.positions) {
    const sku = String(assignments[position.address] || '').trim()
    if (!sku) continue
    if (productSettings?.[sku]?.travado) {
      lockedPositions.add(position.address)
      lockedSkuCounts.set(sku, (lockedSkuCounts.get(sku) || 0) + 1)
    }
  }

  const candidatePositions = layout.positions
    .filter((position) => position.enabled !== false && !lockedPositions.has(position.address))
    .sort((a, b) => {
      const distanceA = manhattan(a, tc)
      const distanceB = manhattan(b, tc)
      return distanceA - distanceB || naturalCompare(a.address, b.address)
    })

  const tokens = []
  for (const [sku, totalSlots] of slotCounts.entries()) {
    const locked = lockedSkuCounts.get(sku) || 0
    const availableCount = Math.max(0, totalSlots - locked)
    const product = productsBySku.get(sku)
    const accesses = number(product?.acessos)
    const score = availableCount ? accesses / availableCount : accesses

    for (let index = 0; index < availableCount; index += 1) {
      tokens.push({ sku, score })
    }
  }

  tokens.sort((a, b) => b.score - a.score || naturalCompare(a.sku, b.sku))

  candidatePositions.forEach((position, index) => {
    result[position.address] = tokens[index]?.sku || ''
  })

  return result
}

function heatLevel(accesses, maxAccesses) {
  if (!maxAccesses || !accesses) return 0
  const ratio = accesses / maxAccesses
  if (ratio >= 0.75) return 5
  if (ratio >= 0.5) return 4
  if (ratio >= 0.25) return 3
  if (ratio >= 0.1) return 2
  return 1
}

function MapCanvas({
  layout,
  assignments,
  productsBySku,
  selectedAddress,
  onSelect,
  mode,
  onDropPosition,
  onToggleBlocked,
}) {
  const occupied = useMemo(
    () => new Set(layout.positions.map((position) => positionKey(position))),
    [layout.positions],
  )
  const maxAccesses = useMemo(
    () => Math.max(0, ...[...productsBySku.values()].map((item) => number(item.acessos))),
    [productsBySku],
  )

  const cells = []
  for (let y = 1; y <= layout.rows; y += 1) {
    for (let x = 1; x <= layout.cols; x += 1) {
      const blocked = layout.blockedCells.some(
        (cell) => integer(cell.x) === x && integer(cell.y) === y,
      )
      const tcCell = isInsideTc(x, y, layout.tc)
      const occupiedCell = occupied.has(cellKey(x, y))

      cells.push(
        <button
          key={'cell-' + x + '-' + y}
          className={
            'ps-map-cell' +
            (blocked ? ' blocked' : '') +
            (tcCell ? ' tc-cell' : '') +
            (occupiedCell ? ' occupied' : '')
          }
          style={{
            gridColumn: x,
            gridRow: y,
          }}
          type="button"
          aria-label={'Célula ' + x + ', ' + y}
          onClick={() => {
            if (mode === 'mapa' && !tcCell && !occupiedCell) {
              onToggleBlocked?.(x, y)
            }
          }}
          onDragOver={(event) => {
            if (mode === 'mapa' && !tcCell && !blocked) {
              event.preventDefault()
            }
          }}
          onDrop={(event) => {
            if (mode !== 'mapa' || tcCell || blocked) return
            event.preventDefault()
            const address = event.dataTransfer.getData('text/picking-position')
            if (address) onDropPosition?.(address, x, y)
          }}
        />,
      )
    }
  }

  return (
    <div className="ps-map-shell">
      <div
        className="ps-map-grid"
        style={{
          gridTemplateColumns: 'repeat(' + layout.cols + ', minmax(30px, 1fr))',
          gridTemplateRows: 'repeat(' + layout.rows + ', 36px)',
        }}
      >
        {cells}

        <div
          className="ps-tc"
          style={{
            gridColumn: layout.tc.x + ' / span ' + layout.tc.w,
            gridRow: layout.tc.y + ' / span ' + layout.tc.h,
          }}
        >
          <strong>{layout.tc.label || 'TC'}</strong>
          <span>FIXA</span>
        </div>

        {layout.positions.map((position) => {
          const sku = String(assignments[position.address] || '').trim()
          const product = productsBySku.get(sku)
          const heat = heatLevel(number(product?.acessos), maxAccesses)

          return (
            <button
              key={position.id || position.address}
              className={
                'ps-position heat-' +
                heat +
                (selectedAddress === position.address ? ' selected' : '') +
                (position.enabled === false ? ' disabled' : '')
              }
              style={{
                gridColumn: position.x,
                gridRow: position.y,
              }}
              type="button"
              draggable={mode === 'mapa'}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/picking-position', position.address)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onClick={() => onSelect?.(position.address)}
              title={
                position.address +
                (sku ? ' • ' + sku + ' • ' + (product?.produto || '') : ' • sem produto')
              }
            >
              <strong>{position.address}</strong>
              <span>{sku || 'LIVRE'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function PickingStudioScreen() {
  const [activeTab, setActiveTab] = useState('mapa')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [meta, setMeta] = useState({})
  const [routes, setRoutes] = useState([])
  const [history, setHistory] = useState([])
  const [layout, setLayout] = useState(() => normalizeLayout())
  const [selectedAddress, setSelectedAddress] = useState('')
  const [swapSource, setSwapSource] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    loadStudio()
  }, [])

  async function loadStudio() {
    setLoading(true)
    setError('')

    try {
      const data = await api.get('/api/picking-studio')
      const serverHistory = Array.isArray(data.historico) ? data.historico : []
      const saved = normalizeLayout(data.layout || {})
      const generated = buildPositionsFromHistory(serverHistory, saved)
      const wmsBaseline = buildWmsBaseline(serverHistory)
      const hasSavedBaseline = Object.keys(saved.baselineAssignments || {}).length > 0

      setHistory(serverHistory)
      setRoutes(Array.isArray(data.rotas) ? data.rotas : [])
      setMeta(data.meta || {})
      setLastUpdated(data.atualizado_em || null)
      setLayout({
        ...generated,
        baselineAssignments: hasSavedBaseline
          ? saved.baselineAssignments
          : wmsBaseline,
        assignments: Object.keys(saved.assignments || {}).length
          ? saved.assignments
          : wmsBaseline,
      })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const products = useMemo(() => aggregateProducts(history), [history])
  const productsBySku = useMemo(
    () => new Map(products.map((item) => [item.sku, item])),
    [products],
  )

  const baselineSimulation = useMemo(
    () => simulateRoutes(routes, layout, layout.baselineAssignments),
    [routes, layout.rows, layout.cols, layout.metersPerCell, layout.tc, layout.blockedCells, layout.positions, layout.baselineAssignments],
  )

  const scenarioSimulation = useMemo(
    () => simulateRoutes(routes, layout, layout.assignments),
    [routes, layout.rows, layout.cols, layout.metersPerCell, layout.tc, layout.blockedCells, layout.positions, layout.assignments],
  )

  const scenarioGain = baselineSimulation.totalMeters
    ? ((baselineSimulation.totalMeters - scenarioSimulation.totalMeters) /
      baselineSimulation.totalMeters) * 100
    : 0

  const currentSlotCountBySku = useMemo(() => {
    const counts = new Map()
    Object.values(layout.assignments).forEach((sku) => {
      const key = String(sku || '').trim()
      if (!key) return
      counts.set(key, (counts.get(key) || 0) + 1)
    })
    return counts
  }, [layout.assignments])

  const baselineSlotCountBySku = useMemo(() => {
    const counts = new Map()
    Object.values(layout.baselineAssignments).forEach((sku) => {
      const key = String(sku || '').trim()
      if (!key) return
      counts.set(key, (counts.get(key) || 0) + 1)
    })
    return counts
  }, [layout.baselineAssignments])

  const mappedAddresses = useMemo(
    () => new Set(layout.positions.map((position) => position.address)),
    [layout.positions],
  )

  const historyAddresses = useMemo(
    () => new Set(history.map((row) => row.origem).filter(Boolean)),
    [history],
  )

  const unmappedCount = [...historyAddresses].filter(
    (address) => !mappedAddresses.has(address),
  ).length

  const selectedPosition = layout.positions.find(
    (position) => position.address === selectedAddress,
  )
  const selectedSku = selectedAddress ? layout.assignments[selectedAddress] : ''
  const selectedProduct = productsBySku.get(selectedSku)

  const optimizedAssignments = useMemo(
    () => optimizeAssignments(
      layout,
      layout.baselineAssignments,
      productsBySku,
      layout.productSettings,
    ),
    [layout, productsBySku],
  )

  const optimizedSimulation = useMemo(
    () => simulateRoutes(routes, layout, optimizedAssignments),
    [routes, layout, optimizedAssignments],
  )

  const optimizationGain = baselineSimulation.totalMeters
    ? ((baselineSimulation.totalMeters - optimizedSimulation.totalMeters) /
      baselineSimulation.totalMeters) * 100
    : 0

  const routeComparison = useMemo(() => {
    const baselineByKey = new Map(
      baselineSimulation.details.map((item) => [item.key, item]),
    )

    return scenarioSimulation.details
      .map((item) => {
        const baseline = baselineByKey.get(item.key)
        const saved = number(baseline?.meters) - number(item.meters)
        return {
          ...item,
          baselineMeters: number(baseline?.meters),
          saved,
        }
      })
      .sort((a, b) => b.saved - a.saved)
      .slice(0, 20)
  }, [baselineSimulation.details, scenarioSimulation.details])

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase()
    if (!term) return products

    return products.filter((product) =>
      String(product.sku).toLowerCase().includes(term) ||
      String(product.produto || '').toLowerCase().includes(term),
    )
  }, [products, productSearch])

  function patchLayout(patch) {
    setLayout((current) => normalizeLayout({
      ...current,
      ...patch,
    }))
  }

  function patchTc(patch) {
    setLayout((current) => normalizeLayout({
      ...current,
      tc: {
        ...current.tc,
        ...patch,
      },
    }))
  }

  function toggleBlocked(x, y) {
    setLayout((current) => {
      const key = cellKey(x, y)
      const exists = current.blockedCells.some(
        (cell) => cellKey(cell.x, cell.y) === key,
      )

      return {
        ...current,
        blockedCells: exists
          ? current.blockedCells.filter((cell) => cellKey(cell.x, cell.y) !== key)
          : [...current.blockedCells, { x, y }],
      }
    })
  }

  function movePosition(address, x, y) {
    const occupied = layout.positions.some(
      (position) =>
        position.address !== address &&
        integer(position.x) === integer(x) &&
        integer(position.y) === integer(y),
    )

    if (occupied || isInsideTc(x, y, layout.tc)) return

    setLayout((current) => ({
      ...current,
      positions: current.positions.map((position) =>
        position.address === address
          ? { ...position, x, y }
          : position,
      ),
      blockedCells: current.blockedCells.filter(
        (cell) => !(integer(cell.x) === integer(x) && integer(cell.y) === integer(y)),
      ),
    }))
  }

  function syncWmsAddresses() {
    setLayout((current) => {
      const next = buildPositionsFromHistory(history, current)
      const wmsBaseline = buildWmsBaseline(history)
      return {
        ...next,
        baselineAssignments: wmsBaseline,
        assignments: wmsBaseline,
      }
    })
    setSwapSource('')
    setMessage('Endereços e produtos atuais sincronizados com o histórico WMS disponível.')
  }

  function addPosition() {
    const address = newAddress.trim()
    if (!address) return

    if (layout.positions.some((position) => position.address === address)) {
      setError('Esse endereço já existe no mapa.')
      return
    }

    const occupied = new Set(layout.positions.map((position) => positionKey(position)))
    let free = null

    for (let y = 1; y <= layout.rows && !free; y += 1) {
      for (let x = 1; x <= layout.cols; x += 1) {
        if (
          !occupied.has(cellKey(x, y)) &&
          !isInsideTc(x, y, layout.tc) &&
          !layout.blockedCells.some(
            (cell) => integer(cell.x) === x && integer(cell.y) === y,
          )
        ) {
          free = { x, y }
          break
        }
      }
    }

    if (!free) {
      setError('Não há célula livre. Aumente o tamanho do mapa.')
      return
    }

    setLayout((current) => ({
      ...current,
      positions: [
        ...current.positions,
        {
          id: 'slot-' + Date.now(),
          address,
          x: free.x,
          y: free.y,
          enabled: true,
        },
      ],
    }))
    setNewAddress('')
    setSelectedAddress(address)
    setError('')
  }

  function removeSelectedPosition() {
    if (!selectedPosition) return
    const address = selectedPosition.address

    setLayout((current) => {
      const assignments = { ...current.assignments }
      const baselineAssignments = { ...current.baselineAssignments }
      delete assignments[address]
      delete baselineAssignments[address]

      return {
        ...current,
        positions: current.positions.filter(
          (position) => position.address !== address,
        ),
        assignments,
        baselineAssignments,
      }
    })

    setSelectedAddress('')
    setSwapSource('')
  }

  function handleSlotSelect(address) {
    setSelectedAddress(address)

    if (activeTab !== 'slotting') return

    if (!swapSource) {
      setSwapSource(address)
      return
    }

    if (swapSource === address) {
      setSwapSource('')
      return
    }

    const sourceSku = String(layout.assignments[swapSource] || '')
    const targetSku = String(layout.assignments[address] || '')

    if (
      layout.productSettings?.[sourceSku]?.travado ||
      layout.productSettings?.[targetSku]?.travado
    ) {
      setMessage('Um dos produtos está travado e não pode ser movimentado.')
      setSwapSource('')
      return
    }

    setLayout((current) => ({
      ...current,
      assignments: {
        ...current.assignments,
        [swapSource]: targetSku,
        [address]: sourceSku,
      },
    }))
    setSwapSource('')
  }

  function restoreBaseline() {
    setLayout((current) => ({
      ...current,
      assignments: { ...current.baselineAssignments },
    }))
    setSwapSource('')
    setMessage('Cenário restaurado para o layout atual do WMS.')
  }

  function applyOptimization() {
    setLayout((current) => ({
      ...current,
      assignments: optimizeAssignments(
        current,
        current.baselineAssignments,
        productsBySku,
        current.productSettings,
      ),
    }))
    setSwapSource('')
    setActiveTab('simulacao')
    setMessage('Sugestão aplicada somente ao cenário. Nada foi alterado no WMS.')
  }

  function updateProductSetting(sku, patch) {
    setLayout((current) => ({
      ...current,
      productSettings: {
        ...current.productSettings,
        [sku]: {
          ...(current.productSettings?.[sku] || {}),
          ...patch,
        },
      },
    }))
  }

  async function saveLayout() {
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const data = await api.post('/api/picking-studio', {
        action: 'save-layout',
        layout,
      })
      setLastUpdated(data.atualizado_em || new Date().toISOString())
      setMessage(data.message || 'Picking Studio salvo.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="ps-loading">
        <div className="ps-spinner" />
        <strong>Carregando Picking Studio...</strong>
        <span>Lendo mapa salvo e histórico de separação do WMS.</span>
      </section>
    )
  }

  return (
    <section className="picking-studio">
      <header className="ps-hero">
        <div>
          <div className="ps-eyebrow">
            <span>ADM</span>
            <span>TC FIXA</span>
            <span>SIMULAÇÃO</span>
          </div>
          <h2>Picking Studio</h2>
          <p>
            Digital twin para redistribuir produtos no picking sem mover a TC.
            Compare o deslocamento atual com cenários antes de mudar qualquer endereço no WMS.
          </p>
        </div>

        <div className="ps-hero-actions">
          <button type="button" className="ps-button ghost" onClick={loadStudio}>
            Atualizar dados
          </button>
          <button
            type="button"
            className="ps-button primary"
            onClick={saveLayout}
            disabled={saving}
          >
            {saving ? 'Salvando...' : 'Salvar cenário'}
          </button>
        </div>
      </header>

      {(error || message) && (
        <div className={'ps-feedback ' + (error ? 'error' : 'success')}>
          {error || message}
        </div>
      )}

      <div className="ps-kpis">
        <article>
          <span>Posições mapeadas</span>
          <strong>{formatNumber(layout.positions.length)}</strong>
          <small>{unmappedCount ? unmappedCount + ' endereços WMS ainda fora do mapa' : 'WMS coberto pelo mapa'}</small>
        </article>
        <article>
          <span>SKUs no histórico</span>
          <strong>{formatNumber(meta.skus || products.length)}</strong>
          <small>{formatNumber(meta.dias || 0)} dias disponíveis</small>
        </article>
        <article>
          <span>Distância atual</span>
          <strong>{formatNumber(baselineSimulation.averageMeters, 1)} m</strong>
          <small>média teórica por mapa/palete</small>
        </article>
        <article>
          <span>Cenário</span>
          <strong className={scenarioGain > 0 ? 'positive' : scenarioGain < 0 ? 'negative' : ''}>
            {scenarioGain > 0 ? '-' : scenarioGain < 0 ? '+' : ''}
            {formatNumber(Math.abs(scenarioGain), 1)}%
          </strong>
          <small>{scenarioGain >= 0 ? 'redução estimada de deslocamento' : 'aumento estimado de deslocamento'}</small>
        </article>
        <article>
          <span>Potencial automático</span>
          <strong className={optimizationGain > 0 ? 'positive' : ''}>
            {formatNumber(Math.max(0, optimizationGain), 1)}%
          </strong>
          <small>frequência x proximidade da TC</small>
        </article>
      </div>

      <nav className="ps-tabs" aria-label="Módulos do Picking Studio">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => {
              setActiveTab(tab.id)
              setSwapSource('')
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'mapa' && (
        <div className="ps-workspace">
          <aside className="ps-sidebar">
            <section className="ps-card">
              <div className="ps-card-title">
                <div>
                  <span className="ps-mini-label">ESTRUTURA</span>
                  <h3>Mapa físico</h3>
                </div>
                <span className="ps-lock-badge">TC não otimiza</span>
              </div>

              <p className="ps-help">
                Arraste as posições para reproduzir o picking real. Clique em células vazias
                para marcar paredes, pilares ou áreas bloqueadas.
              </p>

              <div className="ps-field-grid two">
                <label>
                  <span>Colunas</span>
                  <input
                    type="number"
                    min="8"
                    max="80"
                    value={layout.cols}
                    onChange={(event) => patchLayout({ cols: integer(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Linhas</span>
                  <input
                    type="number"
                    min="8"
                    max="80"
                    value={layout.rows}
                    onChange={(event) => patchLayout({ rows: integer(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Metros por célula</span>
                  <input
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={layout.metersPerCell}
                    onChange={(event) => patchLayout({ metersPerCell: number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Segurança capacidade</span>
                  <input
                    type="number"
                    min="1"
                    max="3"
                    step="0.05"
                    value={layout.safetyFactor}
                    onChange={(event) => patchLayout({ safetyFactor: number(event.target.value) })}
                  />
                </label>
              </div>

              <button type="button" className="ps-button wide" onClick={syncWmsAddresses}>
                Sincronizar endereços do WMS
              </button>
            </section>

            <section className="ps-card">
              <div className="ps-card-title">
                <div>
                  <span className="ps-mini-label">TC FIXA</span>
                  <h3>Posição real da TC</h3>
                </div>
              </div>

              <p className="ps-help">
                Estes campos servem apenas para desenhar a TC onde ela já existe fisicamente.
                O otimizador nunca movimenta a TC.
              </p>

              <div className="ps-field-grid four">
                <label>
                  <span>X</span>
                  <input type="number" value={layout.tc.x} onChange={(event) => patchTc({ x: integer(event.target.value) })} />
                </label>
                <label>
                  <span>Y</span>
                  <input type="number" value={layout.tc.y} onChange={(event) => patchTc({ y: integer(event.target.value) })} />
                </label>
                <label>
                  <span>L</span>
                  <input type="number" value={layout.tc.w} onChange={(event) => patchTc({ w: integer(event.target.value) })} />
                </label>
                <label>
                  <span>A</span>
                  <input type="number" value={layout.tc.h} onChange={(event) => patchTc({ h: integer(event.target.value) })} />
                </label>
              </div>
            </section>

            <section className="ps-card">
              <div className="ps-card-title">
                <div>
                  <span className="ps-mini-label">POSIÇÕES</span>
                  <h3>Adicionar endereço</h3>
                </div>
              </div>

              <div className="ps-inline-form">
                <input
                  type="text"
                  placeholder="Ex.: P051"
                  value={newAddress}
                  onChange={(event) => setNewAddress(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addPosition()
                  }}
                />
                <button type="button" className="ps-button" onClick={addPosition}>
                  Adicionar
                </button>
              </div>

              {selectedPosition && (
                <div className="ps-selected-card">
                  <span>Selecionado</span>
                  <strong>{selectedPosition.address}</strong>
                  <small>
                    X {selectedPosition.x} • Y {selectedPosition.y}
                    {selectedSku ? ' • ' + selectedSku : ''}
                  </small>
                  <button type="button" className="ps-link danger" onClick={removeSelectedPosition}>
                    Remover do desenho
                  </button>
                </div>
              )}
            </section>

            <section className="ps-card compact">
              <div className="ps-stat-row">
                <span>Obstáculos</span>
                <strong>{layout.blockedCells.length}</strong>
              </div>
              <div className="ps-stat-row">
                <span>Último salvamento</span>
                <strong>{lastUpdated ? formatDate(lastUpdated) : '-'}</strong>
              </div>
              <div className="ps-stat-row">
                <span>Base WMS</span>
                <strong>{formatDate(meta.ultima_data)}</strong>
              </div>
            </section>
          </aside>

          <main className="ps-canvas-area">
            <div className="ps-canvas-toolbar">
              <div>
                <strong>Editor do picking</strong>
                <span>Arraste posição • clique vazio = obstáculo • TC em amarelo</span>
              </div>
              <button
                type="button"
                className="ps-button small ghost"
                onClick={() => patchLayout({ blockedCells: [] })}
              >
                Limpar obstáculos
              </button>
            </div>

            <MapCanvas
              layout={layout}
              assignments={layout.assignments}
              productsBySku={productsBySku}
              selectedAddress={selectedAddress}
              onSelect={setSelectedAddress}
              mode="mapa"
              onDropPosition={movePosition}
              onToggleBlocked={toggleBlocked}
            />
          </main>
        </div>
      )}

      {activeTab === 'slotting' && (
        <div className="ps-workspace">
          <aside className="ps-sidebar">
            <section className="ps-card">
              <div className="ps-card-title">
                <div>
                  <span className="ps-mini-label">CENÁRIO</span>
                  <h3>Trocar produtos</h3>
                </div>
              </div>

              <p className="ps-help">
                Clique em uma posição e depois em outra para trocar os produtos.
                A estrutura física e a TC permanecem exatamente no mesmo lugar.
              </p>

              <div className="ps-action-stack">
                <button type="button" className="ps-button primary wide" onClick={applyOptimization}>
                  Gerar cenário otimizado
                </button>
                <button type="button" className="ps-button wide" onClick={restoreBaseline}>
                  Restaurar layout atual
                </button>
              </div>

              {swapSource && (
                <div className="ps-swap-hint">
                  Origem selecionada: <strong>{swapSource}</strong>
                  <span>Agora clique na posição de destino.</span>
                </div>
              )}
            </section>

            <section className="ps-card">
              <div className="ps-card-title">
                <div>
                  <span className="ps-mini-label">POSIÇÃO</span>
                  <h3>{selectedPosition?.address || 'Selecione no mapa'}</h3>
                </div>
              </div>

              {selectedPosition ? (
                <div className="ps-position-detail">
                  <div>
                    <span>SKU</span>
                    <strong>{selectedSku || 'Livre'}</strong>
                  </div>
                  <div>
                    <span>Produto</span>
                    <strong>{selectedProduct?.produto || '-'}</strong>
                  </div>
                  <div>
                    <span>Acessos no histórico</span>
                    <strong>{formatNumber(selectedProduct?.acessos || 0)}</strong>
                  </div>
                  <div>
                    <span>Posições deste SKU</span>
                    <strong>{currentSlotCountBySku.get(selectedSku) || 0}</strong>
                  </div>
                </div>
              ) : (
                <p className="ps-help">Clique em uma posição para ver o produto atual.</p>
              )}
            </section>

            <section className="ps-card compact">
              <div className="ps-legend">
                <span><i className="heat-5" /> giro muito alto</span>
                <span><i className="heat-4" /> giro alto</span>
                <span><i className="heat-3" /> giro médio</span>
                <span><i className="heat-2" /> giro baixo</span>
                <span><i className="heat-0" /> sem leitura</span>
              </div>
            </section>
          </aside>

          <main className="ps-canvas-area">
            <div className="ps-canvas-toolbar">
              <div>
                <strong>Slotting visual</strong>
                <span>
                  Atual: {formatNumber(baselineSimulation.averageMeters, 1)} m/mapa •
                  cenário: {formatNumber(scenarioSimulation.averageMeters, 1)} m/mapa
                </span>
              </div>
              <span className={'ps-gain-pill ' + (scenarioGain >= 0 ? 'good' : 'bad')}>
                {scenarioGain >= 0 ? '−' : '+'}{formatNumber(Math.abs(scenarioGain), 1)}%
              </span>
            </div>

            <MapCanvas
              layout={layout}
              assignments={layout.assignments}
              productsBySku={productsBySku}
              selectedAddress={swapSource || selectedAddress}
              onSelect={handleSlotSelect}
              mode="slotting"
            />
          </main>
        </div>
      )}

      {activeTab === 'produtos' && (
        <div className="ps-panel">
          <div className="ps-panel-head">
            <div>
              <span className="ps-mini-label">DIMENSIONAMENTO</span>
              <h3>Produtos e capacidade</h3>
              <p>
                Cadastre quantas unidades cabem em 1 PLT do picking. Com isso o Studio
                estima pressão de posição usando o pico observado.
              </p>
            </div>

            <label className="ps-search">
              <span>Buscar SKU ou produto</span>
              <input
                type="search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Ex.: Brahma ou 123456"
              />
            </label>
          </div>

          <div className="ps-table-wrap">
            <table className="ps-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Produto</th>
                  <th>Acessos</th>
                  <th>Qtd.</th>
                  <th>Posições atual</th>
                  <th>Posições cenário</th>
                  <th>Pico/dia</th>
                  <th>Capacidade / PLT</th>
                  <th>Necessidade teórica</th>
                  <th>Travado</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.slice(0, 800).map((product) => {
                  const settings = layout.productSettings?.[product.sku] || {}
                  const capacity = number(settings.capacidadePlt)
                  const theoretical = capacity > 0
                    ? Math.max(
                        1,
                        Math.ceil(
                          (number(product.picoQuantidadeDia) * layout.safetyFactor) / capacity,
                        ),
                      )
                    : null

                  return (
                    <tr key={product.sku}>
                      <td><strong>{product.sku}</strong></td>
                      <td className="product-name">{product.produto || '-'}</td>
                      <td>{formatNumber(product.acessos)}</td>
                      <td>{formatNumber(product.quantidade, 0)}</td>
                      <td>{baselineSlotCountBySku.get(product.sku) || 0}</td>
                      <td>{currentSlotCountBySku.get(product.sku) || 0}</td>
                      <td>{formatNumber(product.picoQuantidadeDia, 0)}</td>
                      <td>
                        <input
                          className="ps-table-input"
                          type="number"
                          min="0"
                          step="1"
                          value={settings.capacidadePlt || ''}
                          placeholder="-"
                          onChange={(event) =>
                            updateProductSetting(product.sku, {
                              capacidadePlt: event.target.value
                                ? number(event.target.value)
                                : null,
                            })
                          }
                        />
                      </td>
                      <td>
                        {theoretical === null ? (
                          <span className="ps-muted">cadastre capacidade</span>
                        ) : (
                          <strong
                            className={
                              theoretical > (currentSlotCountBySku.get(product.sku) || 0)
                                ? 'ps-danger-text'
                                : 'ps-positive-text'
                            }
                          >
                            {theoretical} PLT
                          </strong>
                        )}
                      </td>
                      <td>
                        <label className="ps-switch">
                          <input
                            type="checkbox"
                            checked={Boolean(settings.travado)}
                            onChange={(event) =>
                              updateProductSetting(product.sku, {
                                travado: event.target.checked,
                              })
                            }
                          />
                          <span />
                        </label>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'simulacao' && (
        <div className="ps-simulation">
          <section className="ps-compare-grid">
            <article className="ps-compare-card current">
              <span>LAYOUT ATUAL</span>
              <strong>{formatNumber(baselineSimulation.averageMeters, 1)} m</strong>
              <small>média por mapa/palete</small>
              <div>
                <span>Total analisado</span>
                <b>{formatNumber(baselineSimulation.totalMeters / 1000, 1)} km</b>
              </div>
            </article>

            <article className="ps-compare-card scenario">
              <span>SEU CENÁRIO</span>
              <strong>{formatNumber(scenarioSimulation.averageMeters, 1)} m</strong>
              <small>média por mapa/palete</small>
              <div>
                <span>Diferença</span>
                <b className={scenarioGain >= 0 ? 'ps-positive-text' : 'ps-danger-text'}>
                  {scenarioGain >= 0 ? '−' : '+'}{formatNumber(Math.abs(scenarioGain), 1)}%
                </b>
              </div>
            </article>

            <article className="ps-compare-card optimized">
              <span>SUGESTÃO AUTOMÁTICA</span>
              <strong>{formatNumber(optimizedSimulation.averageMeters, 1)} m</strong>
              <small>média por mapa/palete</small>
              <div>
                <span>Potencial</span>
                <b className="ps-positive-text">
                  −{formatNumber(Math.max(0, optimizationGain), 1)}%
                </b>
              </div>
            </article>
          </section>

          <section className="ps-insight-banner">
            <div>
              <span className="ps-mini-label">REGRA PRINCIPAL</span>
              <strong>A TC permanece fixa em todos os cálculos.</strong>
              <p>
                O Studio só redistribui SKUs entre posições existentes. A sugestão não
                escreve nada no WMS: ela serve para testar o ganho antes da mudança física.
              </p>
            </div>
            <button type="button" className="ps-button primary" onClick={applyOptimization}>
              Aplicar sugestão ao cenário
            </button>
          </section>

          <section className="ps-panel">
            <div className="ps-panel-head">
              <div>
                <span className="ps-mini-label">MAPA / PALETE</span>
                <h3>Onde o cenário mais economiza caminhada</h3>
                <p>
                  Simulação baseada na sequência histórica dos SKUs e nas posições desenhadas.
                </p>
              </div>
              <div className="ps-data-badge">
                {formatNumber(routes.length)} mapas/paletes avaliados
              </div>
            </div>

            <div className="ps-table-wrap">
              <table className="ps-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Mapa</th>
                    <th>Palete</th>
                    <th>Usuário</th>
                    <th>Atual</th>
                    <th>Cenário</th>
                    <th>Economia</th>
                  </tr>
                </thead>
                <tbody>
                  {routeComparison.map((route) => (
                    <tr key={route.key}>
                      <td>{formatDate(route.data)}</td>
                      <td><strong>{route.mapa || '-'}</strong></td>
                      <td>{route.palete || '-'}</td>
                      <td>{route.usuario || '-'}</td>
                      <td>{formatNumber(route.baselineMeters, 1)} m</td>
                      <td>{formatNumber(route.meters, 1)} m</td>
                      <td>
                        <strong className={route.saved >= 0 ? 'ps-positive-text' : 'ps-danger-text'}>
                          {route.saved >= 0 ? '−' : '+'}{formatNumber(Math.abs(route.saved), 1)} m
                        </strong>
                      </td>
                    </tr>
                  ))}
                  {!routeComparison.length && (
                    <tr>
                      <td colSpan="7" className="ps-empty-row">
                        Ainda não há rotas suficientes no histórico WMS para comparar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
