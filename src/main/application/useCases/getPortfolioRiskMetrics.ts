import type { AssetQueryDto } from '@shared/contracts/api'
import { buildAssetKey } from '@shared/contracts/api'
import { calculatePortfolioRisk } from '@main/domain/services/portfolioRiskService'
import { AssetRepository } from '@main/repositories/assetRepository'
import { getDatabase } from '@main/infrastructure/db/sqlite'

const RISK_CACHE_TTL_MS = 60 * 60 * 1000

export type PortfolioRiskMetricsRequest = {
  items: Array<{ assetKey: string; marketValue: number }>
}

export type PortfolioRiskMetricsResult = {
  portfolioVolatility?: number
  portfolioSharpeRatio?: number
  maxDrawdown?: number
  commonDateRange?: { start: string; end: string; tradingDays: number }
  correlationMatrix?: {
    assetKeys: string[]
    names: string[]
    matrix: number[][]
  }
}

function buildCacheKey(items: Array<{ assetKey: string; marketValue: number }>): string {
  const payload = items
    .map((item) => `${item.assetKey}:${item.marketValue.toFixed(2)}`)
    .sort()
    .join('|')
  let hash = 0
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i)
    hash = (hash << 5) - hash + ch
    hash |= 0
  }
  return `risk_${hash}`
}

function readRiskCache(cacheKey: string): PortfolioRiskMetricsResult | null {
  try {
    const db = getDatabase()
    const row = db
      .prepare(
        'SELECT data_json, fetched_at FROM portfolio_risk_snapshots WHERE cache_key = ?'
      )
      .get(cacheKey) as Record<string, string> | undefined
    if (!row) return null

    const fetchedAt = new Date(row.fetched_at).getTime()
    if (Date.now() - fetchedAt > RISK_CACHE_TTL_MS) {
      db.prepare('DELETE FROM portfolio_risk_snapshots WHERE cache_key = ?').run(cacheKey)
      return null
    }

    return JSON.parse(row.data_json) as PortfolioRiskMetricsResult
  } catch {
    return null
  }
}

function writeRiskCache(cacheKey: string, data: PortfolioRiskMetricsResult): void {
  try {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      'INSERT OR REPLACE INTO portfolio_risk_snapshots (cache_key, data_json, fetched_at) VALUES (?, ?, ?)'
    ).run(cacheKey, JSON.stringify(data), now)
  } catch {
    // DB write failed — non-critical, skip caching
  }
}

export async function getPortfolioRiskMetrics(
  request: PortfolioRiskMetricsRequest
): Promise<PortfolioRiskMetricsResult> {
  if (request.items.length < 2) {
    return {}
  }

  const cacheKey = buildCacheKey(request.items)
  const cached = readRiskCache(cacheKey)
  if (cached) return cached

  const totalValue = request.items.reduce((sum, item) => sum + item.marketValue, 0)
  if (totalValue <= 0) {
    return {}
  }

  const queryItems: AssetQueryDto[] = request.items.map((item) => {
    return { assetKey: item.assetKey }
  })

  const repository = new AssetRepository()
  const sources = await repository.compare({ items: queryItems })

  const holdings = sources
    .map((source) => {
      const assetKey =
        source.kind === 'STOCK'
          ? buildAssetKey('STOCK', source.stock.market, source.stock.symbol)
          : buildAssetKey(
              source.identifier.assetType,
              source.identifier.market,
              source.identifier.code
            )
      const item = request.items.find((i) => i.assetKey === assetKey)
      if (!item || item.marketValue <= 0) return null

      const name = source.kind === 'STOCK' ? source.stock.name : source.name
      const priceHistory =
        'priceHistory' in source ? source.priceHistory : []

      return {
        assetKey,
        name,
        weight: item.marketValue / totalValue,
        priceHistory
      }
    })
    .filter((h): h is NonNullable<typeof h> => h != null && h.priceHistory.length > 0)

  const result = calculatePortfolioRisk(holdings)
  if (!result) return {}

  writeRiskCache(cacheKey, result)
  return result
}
