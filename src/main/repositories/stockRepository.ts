import { createStockAssetQuery } from '@shared/contracts/api'
import type { StockDetailSource } from '@main/adapters/contracts'
import { assertStockSearchItem, assertStockDetailSource } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'

export class StockRepository {
  constructor(private readonly assetRepository: AssetRepository = new AssetRepository()) {}

  async search(keyword: string) {
    const items = await this.assetRepository.search({
      keyword,
      assetTypes: ['STOCK']
    })
    return items.map(assertStockSearchItem)
  }

  async getDetail(symbol: string): Promise<StockDetailSource> {
    const source = await this.assetRepository.getDetail(createStockAssetQuery(symbol))
    assertStockDetailSource(source)
    return source
  }

  async compare(symbols: string[]): Promise<StockDetailSource[]> {
    const sources = await this.assetRepository.compare({
      items: symbols.map((symbol) => createStockAssetQuery(symbol))
    })

    return sources.map((source) => {
      assertStockDetailSource(source)
      return source
    })
  }
}
