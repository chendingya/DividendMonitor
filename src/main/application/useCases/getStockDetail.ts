import type { StockDetailDto } from '@shared/contracts/api'
import { createStockAssetQuery } from '@shared/contracts/api'
import { assertStockDetailSource, toStockDetailDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function getStockDetail(symbol: string): Promise<StockDetailDto> {
  const repository = new AssetRepository()
  const source = await repository.getDetail(createStockAssetQuery(symbol))
  assertStockDetailSource(source)
  return toStockDetailDto(source)
}
