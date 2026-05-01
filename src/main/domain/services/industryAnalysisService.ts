import type { AssetDetailSource } from '@main/repositories/assetProviderRegistry'

export type IndustrySummary = {
  industryName: string
  avgDividendYield: number
  avgPeRatio: number
  avgRoe: number
  totalMarketCap: number
  stockCount: number
}

export type IndustryStockEntry = {
  assetKey: string
  symbol: string
  name: string
  dividendYield: number
  peRatio: number
  roe: number
  marketCap: number
  percentileInIndustry: number
}

export type IndustryAnalysis = {
  industryName: string
  stocks: IndustryStockEntry[]
  summary: IndustrySummary
}

export type IndustryDistributionItem = {
  industryName: string
  totalValue: number
  percentage: number
  stockCount: number
}

export function aggregateByIndustry(details: AssetDetailSource[]): Map<string, IndustryStockEntry[]> {
  const groups = new Map<string, IndustryStockEntry[]>()

  for (const detail of details) {
    const industry = detail.kind === 'STOCK' ? detail.stock.industry : undefined
    if (!industry) continue

    const entry: IndustryStockEntry = {
      assetKey: detail.kind === 'STOCK'
        ? `STOCK:A_SHARE:${detail.stock.symbol}`
        : `${detail.kind}:A_SHARE:${detail.identifier.code}`,
      symbol: detail.kind === 'STOCK' ? detail.stock.symbol : detail.identifier.code,
      name: detail.kind === 'STOCK' ? detail.stock.name : detail.identifier.code,
      dividendYield: 0,
      peRatio: detail.kind === 'STOCK' ? (detail.stock.peRatio ?? 0) : 0,
      roe: detail.kind === 'STOCK' ? (detail.stock.roe ?? 0) : 0,
      marketCap: detail.kind === 'STOCK' ? (detail.stock.marketCap ?? 0) : 0,
      percentileInIndustry: 0
    }

    // Calculate average dividend yield from dividend events
    if (detail.dividendEvents.length > 0) {
      const recentEvents = detail.dividendEvents.slice(-3)
      let totalYield = 0
      for (const e of recentEvents) {
        if (e.referenceClosePrice > 0) {
          totalYield += e.dividendPerShare / e.referenceClosePrice
        }
      }
      entry.dividendYield = recentEvents.length > 0 ? totalYield / recentEvents.length : 0
    }

    const existing = groups.get(industry)
    if (existing) {
      existing.push(entry)
    } else {
      groups.set(industry, [entry])
    }
  }

  return groups
}

export function rankInIndustry(stocks: IndustryStockEntry[]): IndustryStockEntry[] {
  const sorted = [...stocks].sort((a, b) => b.dividendYield - a.dividendYield)
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].percentileInIndustry = sorted.length > 1 ? 1 - i / (sorted.length - 1) : 0.5
  }
  return sorted
}

export function getIndustryList(groups: Map<string, IndustryStockEntry[]>): IndustrySummary[] {
  const summaries: IndustrySummary[] = []

  for (const [industryName, stocks] of groups) {
    const avgDividendYield = stocks.reduce((s, e) => s + e.dividendYield, 0) / stocks.length
    const avgPeRatio = stocks.reduce((s, e) => s + e.peRatio, 0) / stocks.length
    const avgRoe = stocks.reduce((s, e) => s + e.roe, 0) / stocks.length
    const totalMarketCap = stocks.reduce((s, e) => s + e.marketCap, 0)

    summaries.push({
      industryName,
      avgDividendYield,
      avgPeRatio,
      avgRoe,
      totalMarketCap,
      stockCount: stocks.length
    })
  }

  return summaries.sort((a, b) => b.avgDividendYield - a.avgDividendYield)
}

export function calculateIndustryDistribution(
  positions: Array<{ industry: string; marketValue: number }>
): IndustryDistributionItem[] {
  const groups = new Map<string, { totalValue: number; count: number }>()

  for (const pos of positions) {
    const industry = pos.industry || '未分类'
    const existing = groups.get(industry)
    if (existing) {
      existing.totalValue += pos.marketValue
      existing.count += 1
    } else {
      groups.set(industry, { totalValue: pos.marketValue, count: 1 })
    }
  }

  const grandTotal = Array.from(groups.values()).reduce((s, g) => s + g.totalValue, 0)

  const items: IndustryDistributionItem[] = []
  for (const [industryName, group] of groups) {
    items.push({
      industryName,
      totalValue: group.totalValue,
      percentage: grandTotal > 0 ? group.totalValue / grandTotal : 1 / Math.max(1, groups.size),
      stockCount: group.count
    })
  }

  return items.sort((a, b) => b.totalValue - a.totalValue)
}
