import type { StockDetailDto } from '@shared/contracts/api'
import { buildHistoricalYields, NATURAL_YEAR_YIELD_BASIS } from '@main/domain/services/dividendYieldService'
import { estimateFutureYield } from '@main/domain/services/futureYieldEstimator'
import { StockRepository } from '@main/repositories/stockRepository'

export async function getStockDetail(symbol: string): Promise<StockDetailDto> {
  const repository = new StockRepository()
  const source = await repository.getDetail(symbol)
  const yearlyYields = buildHistoricalYields(source.dividendEvents)
  const estimates = estimateFutureYield({
    latestPrice: source.stock.latestPrice,
    latestTotalShares: source.latestTotalShares,
    latestAnnualNetProfit: source.latestAnnualNetProfit,
    lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
    lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
  })

  return {
    symbol: source.stock.symbol,
    name: source.stock.name,
    market: source.stock.market,
    industry: source.stock.industry,
    latestPrice: source.stock.latestPrice,
    marketCap: source.stock.marketCap,
    peRatio: source.stock.peRatio,
    totalShares: source.stock.totalShares,
    dataSource: source.dataSource,
    yieldBasis: NATURAL_YEAR_YIELD_BASIS,
    yearlyYields,
    dividendEvents: source.dividendEvents,
    futureYieldEstimate: estimates.baseline,
    futureYieldEstimates: [estimates.baseline, estimates.conservative]
  }
}
