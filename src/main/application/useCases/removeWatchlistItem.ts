import { WatchlistRepository } from '@main/repositories/watchlistRepository'

export async function removeWatchlistItem(symbol: string): Promise<void> {
  const watchlistRepository = new WatchlistRepository()
  await watchlistRepository.removeSymbol(symbol)
}
