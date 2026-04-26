import type { BacktestResultDto } from '@shared/contracts/api'
import { buildStockAssetKey, createStockAssetQuery } from '@shared/contracts/api'
import { assertStockDetailSource } from '@main/application/mappers/stockDtoMappers'
import { runDividendReinvestmentBacktest as runBacktest } from '@main/domain/services/dividendReinvestmentBacktestService'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function runDividendReinvestmentBacktest(
  symbol: string,
  buyDate: string
): Promise<BacktestResultDto> {
  const repository = new AssetRepository()
  const source = await repository.getDetail(createStockAssetQuery(symbol))
  assertStockDetailSource(source)
  const result = runBacktest({
    symbol,
    buyDate,
    priceHistory: source.priceHistory,
    dividendEvents: source.dividendEvents
  })

  return {
    assetKey: buildStockAssetKey(symbol),
    assetType: 'STOCK',
    market: 'A_SHARE',
    code: symbol,
    symbol,
    ...result
  }
}
