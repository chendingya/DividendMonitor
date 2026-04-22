import type { HistoricalYieldResponseDto } from '@shared/contracts/api'
import { buildHistoricalYields, NATURAL_YEAR_YIELD_BASIS } from '@main/domain/services/dividendYieldService'
import { StockRepository } from '@main/repositories/stockRepository'

export async function getHistoricalYield(symbol: string): Promise<HistoricalYieldResponseDto> {
  const repository = new StockRepository()
  const source = await repository.getDetail(symbol)

  return {
    symbol,
    basis: NATURAL_YEAR_YIELD_BASIS,
    yearlyYields: buildHistoricalYields(source.dividendEvents),
    dividendEvents: source.dividendEvents
  }
}
