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
  for (const [assetKey, shares] of assetShares.entries()) {
    if (shares <= 0) continue
    try {
      const fy = await estimateFutureYieldForAsset(parseAssetKey(assetKey))
      const baseline = fy.estimates.find((e) => e.method === 'baseline')
      const perShare = baseline?.isAvailable ? (baseline?.estimatedDividendPerShare ?? 0) : 0
      annualEstimatedTotal += perShare * shares
    } catch {
      continue
    }
  }

  const history = await listDividendHistory({
    fromDate: `${targetYear}-01-01`,
    toDate: `${targetYear}-12-31`
  })
  const yearToDateActual =
    history.yearlySummary.find((y) => y.year === targetYear)?.totalAmount ?? 0

  const upcoming: UpcomingDividendDto[] = await listUpcomingDividends()
  const upcomingFiltered = upcoming.filter(
    (u) => !u.announceDate || String(u.announceDate).slice(0, 4) === String(targetYear)
  )
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