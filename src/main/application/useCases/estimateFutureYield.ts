import type { FutureYieldResponseDto } from '@shared/contracts/api'
import { estimateFutureYield as buildEstimate } from '@main/domain/services/futureYieldEstimator'
import { StockRepository } from '@main/repositories/stockRepository'

export async function estimateFutureYield(symbol: string): Promise<FutureYieldResponseDto> {
  const repository = new StockRepository()
  const source = await repository.getDetail(symbol)
  const estimates = buildEstimate({
    latestPrice: source.stock.latestPrice,
    latestTotalShares: source.latestTotalShares,
    latestAnnualNetProfit: source.latestAnnualNetProfit,
    lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
    lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
  })

  return {
    symbol,
    estimates: [estimates.baseline, estimates.conservative]
  }
}
