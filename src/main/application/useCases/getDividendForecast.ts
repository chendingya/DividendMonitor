import type {
  AssetQueryDto,
  AssetType,
  DividendForecastDto,
  MarketCode,
  UpcomingDividendDto
} from '@shared/contracts/api'
import { listUpcomingDividends } from '@main/application/useCases/listUpcomingDividends'
import { listDividendHistory } from '@main/application/useCases/listDividendHistory'
import { estimateFutureYieldForAsset } from '@main/application/useCases/estimateFutureYieldForAsset'
import { getPortfolioRepository } from '@main/repositories/repositoryFactory'

function parseAssetKey(assetKey: string): AssetQueryDto {
  const [assetType, market, ...codeParts] = assetKey.split(':')
  const code = codeParts.join(':')
  return {
    assetType: assetType as AssetType,
    market: market as MarketCode,
    code
  }
}

export async function getDividendForecast(year?: number): Promise<DividendForecastDto> {
  const targetYear = year ?? new Date().getFullYear()
  const portfolioRepo = getPortfolioRepository()
  const positions = await portfolioRepo.list()

  const assetShares = new Map<string, number>()
  for (const pos of positions) {
    if (!pos.assetKey || !pos.openedAt) continue
    const delta = pos.direction === 'SELL' ? -pos.shares : pos.shares
    assetShares.set(pos.assetKey, Math.max(0, (assetShares.get(pos.assetKey) ?? 0) + delta))
  }

  let annualEstimatedTotal = 0
  const assetKeys = [...assetShares.entries()]
    .filter(([, shares]) => shares > 0)
    .map(([assetKey]) => assetKey)

  // 分批并发抓取，避免大持仓下串行 N 次网络请求导致页面长时间无响应。
  const BATCH_SIZE = 5
  for (let i = 0; i < assetKeys.length; i += BATCH_SIZE) {
    const batch = assetKeys.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (assetKey) => {
        const fy = await estimateFutureYieldForAsset(parseAssetKey(assetKey))
        const baseline = fy.estimates.find((e) => e.method === 'baseline')
        const perShare = baseline?.isAvailable ? (baseline?.estimatedDividendPerShare ?? 0) : 0
        return perShare * assetShares.get(assetKey)!
      })
    )
    for (const result of results) {
      if (result.status === 'fulfilled') {
        annualEstimatedTotal += result.value
      }
    }
  }

  const history = await listDividendHistory({
    fromDate: `${targetYear}-01-01`,
    toDate: `${targetYear}-12-31`
  })
  const yearToDateActual =
    history.yearlySummary.find((y) => y.year === targetYear)?.totalAmount ?? 0

  const upcoming: UpcomingDividendDto[] = await listUpcomingDividends()
  // 无公告日的预案事件（基金/ETF）按 year 归入当年，避免每年重复计入。
  const upcomingFiltered = upcoming.filter((u) => {
    const yearStr = u.announceDate ? String(u.announceDate).slice(0, 4) : String(u.year)
    return yearStr === String(targetYear)
  })
  const upcomingPlanned = upcomingFiltered.reduce((acc, u) => acc + u.estimatedAmount, 0)

  const remainingEstimated = Math.max(
    0,
    annualEstimatedTotal - yearToDateActual - upcomingPlanned
  )

  return {
    year: targetYear,
    annualEstimatedTotal,
    yearToDateActual,
    upcomingPlanned,
    remainingEstimated,
    details: { upcoming: upcomingFiltered }
  }
}