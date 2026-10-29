import type { WatchlistEntryDto } from '@shared/contracts/api'
import { loadWatchlistEntries } from '@main/application/useCases/loadWatchlistEntries'
import { getWatchlistRepository } from '@main/repositories/repositoryFactory'

export async function listWatchlist(): Promise<WatchlistEntryDto[]> {
  const watchlistRepository = getWatchlistRepository()
  const assets = await watchlistRepository.listAssets()
  return loadWatchlistEntries(assets)
}
