import type { PortfolioPositionDto } from '@shared/contracts/api'
import { buildAssetKey, buildStockAssetKey, createStockAssetQuery, parseAssetKey } from '@shared/contracts/api'
import { portfolioApi } from '@renderer/services/portfolioApi'

export type PortfolioPosition = {
  id: string
  assetKey?: string
  assetType?: 'STOCK' | 'ETF' | 'FUND'
  market?: 'A_SHARE'
  code?: string
  symbol?: string
  name: string
  direction?: 'BUY' | 'SELL'
  shares: number
  avgCost: number
  updatedAt: string
}

const PORTFOLIO_KEY = 'dm:portfolio-positions'
const PORTFOLIO_MIGRATION_KEY = 'dm:portfolio-migrated-to-backend'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function isAShareSymbol(symbol: string) {
  return /^(6|0|3)\d{5}$/.test(symbol.trim())
}

function normalizeName(name: string) {
  return name.trim() || '未命名标的'
}

function deriveAssetIdentity(position: Pick<PortfolioPosition, 'assetKey' | 'assetType' | 'market' | 'code' | 'symbol'>) {
  const parsed = position.assetKey ? parseAssetKey(position.assetKey) : null
  if (parsed) {
    return {
      assetKey: position.assetKey,
      assetType: parsed.assetType,
      market: parsed.market,
      code: parsed.code,
      symbol: parsed.assetType === 'STOCK' ? position.symbol?.trim() || parsed.code : undefined
    }
  }

  const symbol = position.symbol?.trim() ?? ''
  if (symbol) {
    return {
      assetKey: buildStockAssetKey(symbol),
      assetType: 'STOCK' as const,
      market: 'A_SHARE' as const,
      code: symbol,
      symbol
    }
  }

  const code = position.code?.trim() ?? ''
  const assetType = position.assetType
  const market = position.market
  if (assetType && market && code) {
    return {
      assetKey: buildAssetKey(assetType, market, code),
      assetType,
      market,
      code,
      symbol: assetType === 'STOCK' ? code : undefined
    }
  }

  return null
}

function normalizePosition(position: PortfolioPosition): PortfolioPosition | null {
  const assetIdentity = deriveAssetIdentity(position)
  const shares = Number(position.shares)
  const avgCost = Number(position.avgCost)
  if (!position.id?.trim()) {
    return null
  }
  if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
    return null
  }
  if (assetIdentity?.symbol && !isAShareSymbol(assetIdentity.symbol)) {
    return null
  }
  return {
    id: position.id,
    assetKey: assetIdentity?.assetKey,
    assetType: assetIdentity?.assetType,
    market: assetIdentity?.market,
    code: assetIdentity?.code,
    symbol: assetIdentity?.symbol,
    name: normalizeName(position.name),
    direction: position.direction === 'SELL' ? 'SELL' : 'BUY',
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

function markPortfolioMigrated() {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(PORTFOLIO_MIGRATION_KEY, '1')
}

function isPortfolioMigrated() {
  if (!canUseStorage()) {
    return false
  }

  return window.localStorage.getItem(PORTFOLIO_MIGRATION_KEY) === '1'
}

export function clearLegacyPortfolioPositions() {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.removeItem(PORTFOLIO_KEY)
}

function toBackendRequest(position: PortfolioPosition) {
  const assetIdentity = deriveAssetIdentity(position)
  return {
    id: position.id,
    assetKey: assetIdentity?.assetKey,
    assetType: assetIdentity?.assetType,
    market: assetIdentity?.market,
    code: assetIdentity?.code,
    symbol: assetIdentity?.symbol,
    name: position.name,
    direction: position.direction === 'SELL' ? 'SELL' : 'BUY',
    shares: position.shares,
    avgCost: position.avgCost
  } as const
}

function fromDto(position: PortfolioPositionDto): PortfolioPosition {
  return {
    id: position.id,
    assetKey: position.assetKey,
    assetType: position.assetType,
    market: position.market,
    code: position.code,
    symbol: position.symbol ?? (position.assetType === 'STOCK' ? position.code : undefined),
    name: position.name,
    direction: position.direction,
    shares: position.shares,
    avgCost: position.avgCost,
    updatedAt: position.updatedAt
  }
}

export async function migrateLegacyPortfolioPositionsToBackend() {
  if (isPortfolioMigrated()) {
    return
  }

  const legacyPositions = readPortfolioPositions()
  if (legacyPositions.length === 0) {
    markPortfolioMigrated()
    return
  }

  for (const position of legacyPositions) {
    await portfolioApi.upsert(toBackendRequest(position))
  }

  clearLegacyPortfolioPositions()
  markPortfolioMigrated()
}

export async function listPortfolioPositionsFromBackend(): Promise<PortfolioPosition[]> {
  await migrateLegacyPortfolioPositionsToBackend()
  const items = await portfolioApi.list()
  return items.map(fromDto)
}

export async function upsertPortfolioPositionInBackend(input: Omit<PortfolioPosition, 'updatedAt'>) {
  await migrateLegacyPortfolioPositionsToBackend()
  const assetIdentity = deriveAssetIdentity(input)
  await portfolioApi.upsert({
    id: input.id || undefined,
    assetKey: assetIdentity?.assetKey,
    assetType: assetIdentity?.assetType,
    market: assetIdentity?.market,
    code: assetIdentity?.code,
    symbol: assetIdentity?.symbol,
    name: normalizeName(input.name),
    direction: input.direction === 'SELL' ? 'SELL' : 'BUY',
    shares: input.shares,
    avgCost: input.avgCost
  })
}

export async function removePortfolioPositionInBackend(id: string) {
  await migrateLegacyPortfolioPositionsToBackend()
  await portfolioApi.remove(id)
}

export async function removePortfolioPositionsBySymbolInBackend(symbol: string) {
  await migrateLegacyPortfolioPositionsToBackend()
  await portfolioApi.removeByAsset(createStockAssetQuery(symbol))
}

export async function removePortfolioPositionsByAssetInBackend(assetKey: string) {
  await migrateLegacyPortfolioPositionsToBackend()
  await portfolioApi.removeByAsset({ assetKey })
}

export async function replacePortfolioPositionsBySymbolInBackend(
  symbol: string,
  payload: { name: string; shares: number; avgCost: number }
) {
  await migrateLegacyPortfolioPositionsToBackend()
  await portfolioApi.replaceByAsset({
    asset: createStockAssetQuery(symbol),
    name: normalizeName(payload.name),
    shares: payload.shares,
    avgCost: payload.avgCost
  })
}

export async function replacePortfolioPositionsByAssetInBackend(
  assetKey: string,
  payload: { name: string; shares: number; avgCost: number }
) {
  await migrateLegacyPortfolioPositionsToBackend()
  await portfolioApi.replaceByAsset({
    asset: { assetKey },
    name: normalizeName(payload.name),
    shares: payload.shares,
    avgCost: payload.avgCost
  })
}

export function upsertPortfolioPosition(input: Omit<PortfolioPosition, 'updatedAt'>) {
  const positions = readPortfolioPositions()
  const assetIdentity = deriveAssetIdentity(input)
  const id = input.id?.trim() || `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const next: PortfolioPosition = {
    ...input,
    id,
    assetKey: assetIdentity?.assetKey,
    assetType: assetIdentity?.assetType,
    market: assetIdentity?.market,
    code: assetIdentity?.code,
    symbol: assetIdentity?.symbol,
    name: normalizeName(input.name),
    direction: input.direction === 'SELL' ? 'SELL' : 'BUY',
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

export function removePortfolioPositionsBySymbol(symbol: string) {
  const target = symbol.trim()
  if (!target) {
    return readPortfolioPositions()
  }
  const positions = readPortfolioPositions().filter((item) => item.symbol !== target)
  savePortfolioPositions(positions)
  return positions
}

export function replacePortfolioPositionsBySymbol(
  symbol: string,
  payload: { name: string; shares: number; avgCost: number }
) {
  const target = symbol.trim()
  if (!target) {
    return readPortfolioPositions()
  }
  const rest = readPortfolioPositions().filter((item) => item.symbol !== target)
  const next: PortfolioPosition = {
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol: target,
    name: normalizeName(payload.name),
    direction: 'BUY',
    shares: payload.shares,
    avgCost: payload.avgCost,
    updatedAt: new Date().toISOString()
  }
  savePortfolioPositions([next, ...rest])
  return readPortfolioPositions()
}
