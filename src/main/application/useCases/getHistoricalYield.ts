import type { HistoricalYieldResponseDto } from '@shared/contracts/api'
import { createStockAssetQuery } from '@shared/contracts/api'
import { assertStockDetailSource, toHistoricalYieldResponseDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function getHistoricalYield(symbol: string): Promise<HistoricalYieldResponseDto> {
  const repository = new AssetRepository()
  const source = await repository.getDetail(createStockAssetQuery(symbol))
  assertStockDetailSource(source)
  return toHistoricalYieldResponseDto(source)
}
