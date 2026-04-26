import type { ComparisonRowDto } from '@shared/contracts/api'
import { createStockAssetQuery } from '@shared/contracts/api'
import { assertStockDetailSource, toStockComparisonRowDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function compareStocks(symbols: string[]): Promise<ComparisonRowDto[]> {
  const repository = new AssetRepository()
  const sources = await repository.compare({
    items: symbols.map((symbol) => createStockAssetQuery(symbol))
  })

  return sources.map((source) => {
    assertStockDetailSource(source)
    return toStockComparisonRowDto(source)
  })
}
