import { StockRepository } from '@main/repositories/stockRepository'
import { WatchlistRepository } from '@main/repositories/watchlistRepository'

export async function addWatchlistItem(symbol: string): Promise<void> {
  const repository = new StockRepository()
  const watchlistRepository = new WatchlistRepository()

  // Validate the symbol against the current data source before persisting it locally.
  await repository.getDetail(symbol)
  await watchlistRepository.addSymbol(symbol)
}
