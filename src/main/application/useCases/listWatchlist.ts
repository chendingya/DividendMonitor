import type { WatchlistItemDto } from '@shared/contracts/api'
import { estimateFutureYield } from '@main/domain/services/futureYieldEstimator'
import { StockRepository } from '@main/repositories/stockRepository'
import { WatchlistRepository } from '@main/repositories/watchlistRepository'

export async function listWatchlist(): Promise<WatchlistItemDto[]> {
  const stockRepository = new StockRepository()
  const watchlistRepository = new WatchlistRepository()
  const symbols = await watchlistRepository.listSymbols()

  if (symbols.length === 0) {
    return []
  }

  const sources = await Promise.allSettled(symbols.map((symbol) => stockRepository.getDetail(symbol)))

  return sources
    .flatMap((source) => {
      if (source.status !== 'fulfilled') {
        return []
      }

      return [source.value]
    })
    .map((source) => {
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
