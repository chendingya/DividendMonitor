import type { IndustryAnalysis, IndustryDistributionItem } from '@main/domain/services/industryAnalysisService'
import { aggregateByIndustry, getIndustryList, rankInIndustry, calculateIndustryDistribution } from '@main/domain/services/industryAnalysisService'
import { AssetRepository } from '@main/repositories/assetRepository'
import { WatchlistRepository } from '@main/repositories/watchlistRepository'
import { PortfolioRepository } from '@main/repositories/portfolioRepository'
import { buildAssetKey } from '@shared/contracts/api'

export async function getIndustryAnalysis(
  industryName?: string,
  assetKeys?: string[]
): Promise<IndustryAnalysis[]> {
  const repository = new AssetRepository()

  // Gather asset identifiers from watchlist + portfolio, or use provided keys
  const identifiers: Array<{ assetType: string; market: string; code: string }> = []

  if (assetKeys && assetKeys.length > 0) {
    for (const key of assetKeys) {
      const parts = key.split(':')
      if (parts.length >= 3) {
        identifiers.push({ assetType: parts[0], market: parts[1], code: parts.slice(2).join(':') })
      }
    }
  } else {
    const watchlistRepo = new WatchlistRepository()
    const portfolioRepo = new PortfolioRepository()
    const watchlistItems = await watchlistRepo.listAssets()
    const portfolioItems = await portfolioRepo.list()

    const seen = new Set<string>()
    for (const item of watchlistItems) {
      const key = buildAssetKey(item.assetType, item.market, item.code)
      if (!seen.has(key)) {
        seen.add(key)
        identifiers.push({ assetType: item.assetType, market: item.market, code: item.code })
      }
    }
    for (const item of portfolioItems) {
      const key = buildAssetKey(item.assetType, item.market, item.code)
      if (!seen.has(key)) {
        seen.add(key)
        identifiers.push({ assetType: item.assetType, market: item.market, code: item.code })
      }
    }
  }

  // Fetch details in parallel batches to avoid overwhelming the API
  const BATCH_SIZE = 5
  const ids = identifiers.slice(0, 100)
  const details: Awaited<ReturnType<typeof repository.getDetail>>[] = []

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map((id) =>
        repository.getDetail({
          assetType: id.assetType as 'STOCK' | 'ETF' | 'FUND',
          market: id.market as 'A_SHARE',
          code: id.code
        })
      )
    )
    for (const r of results) {
      if (r.status === 'fulfilled') {
        details.push(r.value)
      }
    }
  }

  const groups = aggregateByIndustry(details)

  const results: IndustryAnalysis[] = []

  for (const [name, stocks] of groups) {
    if (industryName && name !== industryName) continue

    const ranked = rankInIndustry(stocks)
    const list = getIndustryList(new Map([[name, ranked]]))
    results.push({
      industryName: name,
      stocks: ranked,
      summary: list[0]
    })
  }

  return results.sort((a, b) => b.summary.avgDividendYield - a.summary.avgDividendYield)
}

export async function getIndustryDistribution(): Promise<IndustryDistributionItem[]> {
  const portfolioRepo = new PortfolioRepository()
  const repository = new AssetRepository()
  const portfolioItems = await portfolioRepo.list()

  if (portfolioItems.length === 0) return []

  const positions: Array<{ industry: string; marketValue: number }> = []

  for (const item of portfolioItems) {
    try {
      const detail = await repository.getDetail({
        assetType: item.assetType,
        market: item.market,
        code: item.code
      })
      const industry = detail.kind === 'STOCK' ? detail.stock.industry : undefined
      const marketValue = (item.shares ?? 0) * (detail.kind === 'STOCK' ? detail.stock.latestPrice : 0)
      positions.push({ industry: industry ?? '未分类', marketValue })
    } catch {
      positions.push({ industry: '未分类', marketValue: 0 })
    }
  }

  return calculateIndustryDistribution(positions)
}
