import type { ComparisonRowDto } from '@shared/contracts/api'
import { buildHistoricalYields } from '@main/domain/services/dividendYieldService'
import { estimateFutureYield } from '@main/domain/services/futureYieldEstimator'
import { buildValuationWindows } from '@main/domain/services/valuationService'
import { StockRepository } from '@main/repositories/stockRepository'

export async function compareStocks(symbols: string[]): Promise<ComparisonRowDto[]> {
  const repository = new StockRepository()
  const sources = await repository.compare(symbols)

  return sources.map((source) => {
    const yearlyYields = buildHistoricalYields(source.dividendEvents)
    const estimates = estimateFutureYield({
      latestPrice: source.stock.latestPrice,
      latestTotalShares: source.latestTotalShares,
      latestAnnualNetProfit: source.latestAnnualNetProfit,
      lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
      lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
    })
    const averageYield =
      yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(yearlyYields.length, 1)

    return {
      symbol: source.stock.symbol,
      name: source.stock.name,
      latestPrice: source.stock.latestPrice,
      marketCap: source.stock.marketCap,
      peRatio: source.stock.peRatio,
      pbRatio: source.stock.pbRatio,
      averageYield,
      estimatedFutureYield: estimates.baseline.estimatedFutureYield,
      valuation: {
        pe: source.valuation?.pe ? buildValuationWindows(source.valuation.pe) : undefined,
        pb: source.valuation?.pb ? buildValuationWindows(source.valuation.pb) : undefined
      }
    }
  })
}
