import type { StockSearchItemDto } from '@shared/contracts/api'
import { assertStockSearchItem } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function searchStocks(keyword: string): Promise<StockSearchItemDto[]> {
  const repository = new AssetRepository()
  const items = await repository.search({
    keyword,
    assetTypes: ['STOCK']
  })

  return items.map(assertStockSearchItem)
}
