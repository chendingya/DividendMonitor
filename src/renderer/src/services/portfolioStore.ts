export type PortfolioPosition = {
  id: string
  symbol?: string
  name: string
  shares: number
  avgCost: number
  updatedAt: string
}

const PORTFOLIO_KEY = 'dm:portfolio-positions'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function isAShareSymbol(symbol: string) {
  return /^(6|0|3)\d{5}$/.test(symbol.trim())
}

function normalizeName(name: string) {
  return name.trim() || '未命名标的'
}

function normalizePosition(position: PortfolioPosition): PortfolioPosition | null {
  const symbol = position.symbol?.trim() ?? ''
  const shares = Number(position.shares)
  const avgCost = Number(position.avgCost)
  if (!position.id?.trim()) {
    return null
  }
  if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
    return null
  }
  if (symbol && !isAShareSymbol(symbol)) {
    return null
  }
  return {
    id: position.id,
    symbol: symbol || undefined,
    name: normalizeName(position.name),
    shares,
    avgCost,
    updatedAt: position.updatedAt || new Date().toISOString()
  }
}

export function readPortfolioPositions(): PortfolioPosition[] {
  if (!canUseStorage()) {
    return []
  }
  const raw = window.localStorage.getItem(PORTFOLIO_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as PortfolioPosition[]
    return parsed.map(normalizePosition).filter((item): item is PortfolioPosition => item != null)
  } catch {
    return []
  }
}

export function savePortfolioPositions(positions: PortfolioPosition[]) {
  if (!canUseStorage()) {
    return
  }
  const normalized = positions.map(normalizePosition).filter((item): item is PortfolioPosition => item != null)
  window.localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(normalized))
}

export function upsertPortfolioPosition(input: Omit<PortfolioPosition, 'updatedAt'>) {
  const positions = readPortfolioPositions()
  const symbol = input.symbol?.trim() ?? ''
  const id = input.id?.trim() || symbol || `asset-${Date.now()}`
  const next: PortfolioPosition = {
    ...input,
    id,
    symbol: symbol || undefined,
    name: normalizeName(input.name),
    updatedAt: new Date().toISOString()
  }
  const index = positions.findIndex((item) => item.id === next.id)
  if (index >= 0) {
    positions[index] = next
  } else {
    positions.unshift(next)
  }
  savePortfolioPositions(positions)
  return positions
}

export function removePortfolioPosition(id: string) {
  const target = id.trim()
  const positions = readPortfolioPositions().filter((item) => item.id !== target)
  savePortfolioPositions(positions)
  return positions
}
