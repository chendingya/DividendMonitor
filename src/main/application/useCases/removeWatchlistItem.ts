import { getWatchlistRepository } from '@main/repositories/repositoryFactory'

export async function removeWatchlistItem(symbol: string): Promise<void> {
  const watchlistRepository = getWatchlistRepository()
  await watchlistRepository.removeSymbol(symbol)
}
