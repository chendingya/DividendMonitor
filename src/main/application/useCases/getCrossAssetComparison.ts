import type { CrossAssetComparisonDto } from '@shared/contracts/api'
import { WatchlistRepository } from '@main/repositories/watchlistRepository'
import { HousingService } from '@main/application/services/housingService'
import { compareAssets } from '@main/application/useCases/compareAssets'
import {
  buildCrossAssetComparison,
  type CrossAssetHousingSource,
  type CrossAssetStockSource
} from '@main/domain/services/crossAssetComparisonService'
import { calculateIndexSeriesVolatility } from '@main/domain/services/housingCalculationService'

const MAX_STOCK_POINTS = 20

/**
 * 跨资产收益对比：自选股票（股息率/年化波动率）+ 关注城市（租金收益率/房价指数年化波动率）。
 * 计算统一在主进程完成，前端只负责展示散点图与表格。
 */
export async function getCrossAssetComparison(): Promise<CrossAssetComparisonDto> {
  const watchlistRepo = new WatchlistRepository()
  const housingService = new HousingService()

  const watchlist = await watchlistRepo.listAssets()
  const assetKeys = watchlist
    .map((item) => item.assetKey)
    .filter((assetKey): assetKey is string => Boolean(assetKey))
    .slice(0, MAX_STOCK_POINTS)

  const [stockRows, cities] = await Promise.all([
    assetKeys.length > 0
      ? compareAssets({ items: assetKeys.map((assetKey) => ({ assetKey })) })
      : Promise.resolve([]),
    housingService.listCities()
  ])

  const stocks: CrossAssetStockSource[] = stockRows.map((row) => ({
    assetKey: row.assetKey,
    name: row.name,
    code: row.code,
    symbol: row.symbol,
    yieldPercent: row.estimatedFutureYield ?? row.averageYield,
    volatilityPercent: row.annualVolatility,
    industry: row.industry
  }))

  const watchedCities = cities.filter((city) => city.isWatched)
  const details = await Promise.all(
    watchedCities.map((city) => housingService.getCityDetail(city.city).catch(() => null))
  )
  const housing: CrossAssetHousingSource[] = watchedCities.map((city, index) => {
    const detail = details[index]
    const series = detail?.indexSeries ?? []
    const volatility = calculateIndexSeriesVolatility(
      series.map((point) => ({ reportDate: point.reportDate, index: point.newHomeIndex }))
    )
    return {
      city: city.city,
      yieldPercent: city.rentalYieldPercent,
      volatilityPercent: volatility ?? undefined,
      pricePerSqm: city.pricePerSqm
    }
  })

  return buildCrossAssetComparison({ stocks, housing })
}
