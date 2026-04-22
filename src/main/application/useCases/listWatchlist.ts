import type { WatchlistItemDto } from '@shared/contracts/api'
import { estimateFutureYield } from '@main/domain/services/futureYieldEstimator'
import { StockRepository } from '@main/repositories/stockRepository'

export async function listWatchlist(): Promise<WatchlistItemDto[]> {
  const repository = new StockRepository()
  const sources = await repository.listWatchlist()

  return sources.map((source) => {
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
      latestPrice: source.stock.latestPrice,
      peRatio: source.stock.peRatio,
      estimatedFutureYield: estimates.baseline.estimatedFutureYield
    }
  })
}
