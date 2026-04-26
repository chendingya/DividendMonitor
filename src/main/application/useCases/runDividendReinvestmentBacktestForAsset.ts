import type { AssetBacktestRequestDto, BacktestResultDto } from '@shared/contracts/api'
import { buildAssetKey, resolveAssetQuery } from '@shared/contracts/api'
import { runDividendReinvestmentBacktest as runBacktest } from '@main/domain/services/dividendReinvestmentBacktestService'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function runDividendReinvestmentBacktestForAsset(
  request: AssetBacktestRequestDto
): Promise<BacktestResultDto> {
  const identifier = resolveAssetQuery(request.asset)
  const repository = new AssetRepository()
  const source = await repository.getDetail(request.asset)
  const result = runBacktest({
    symbol: identifier.code,
    buyDate: request.buyDate,
    priceHistory: source.priceHistory,
    dividendEvents: source.dividendEvents
  })

  return {
    assetKey: buildAssetKey(identifier.assetType, identifier.market, identifier.code),
    assetType: identifier.assetType,
    market: identifier.market,
    code: identifier.code,
    symbol: source.kind === 'STOCK' ? source.stock.symbol : identifier.code,
    ...result
  }
}
