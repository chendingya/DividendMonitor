import type { BacktestResultDto } from '@shared/contracts/api'
import { runDividendReinvestmentBacktest as runBacktest } from '@main/domain/services/dividendReinvestmentBacktestService'
import { StockRepository } from '@main/repositories/stockRepository'

export async function runDividendReinvestmentBacktest(
  symbol: string,
  buyDate: string
): Promise<BacktestResultDto> {
  const repository = new StockRepository()
  const source = await repository.getDetail(symbol)
  const result = runBacktest({
    symbol,
    buyDate,
    priceHistory: source.priceHistory,
    dividendEvents: source.dividendEvents
  })

  return {
    symbol,
    ...result
  }
}
