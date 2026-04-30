import { createStockAssetQuery } from '@shared/contracts/api'
import { StockRepository } from '@main/repositories/stockRepository'
import { getWatchlistRepository } from '@main/repositories/repositoryFactory'

export async function addWatchlistItem(symbol: string): Promise<void> {
  const repository = new StockRepository()
  const watchlistRepository = getWatchlistRepository()

  // Validate the symbol against the current data source before persisting it locally.
  const detail = await repository.getDetail(symbol)
  const asset = createStockAssetQuery(symbol)
  await watchlistRepository.addAsset({
    assetType: 'STOCK',
    market: 'A_SHARE',
    code: asset.code ?? symbol,
    name: detail.stock.name
  })
}
