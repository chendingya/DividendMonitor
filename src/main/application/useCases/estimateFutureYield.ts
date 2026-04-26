import type { FutureYieldResponseDto } from '@shared/contracts/api'
import { createStockAssetQuery } from '@shared/contracts/api'
import { assertStockDetailSource, toFutureYieldResponseDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function estimateFutureYield(symbol: string): Promise<FutureYieldResponseDto> {
  const repository = new AssetRepository()
  const source = await repository.getDetail(createStockAssetQuery(symbol))
  assertStockDetailSource(source)
  return toFutureYieldResponseDto(source)
}
