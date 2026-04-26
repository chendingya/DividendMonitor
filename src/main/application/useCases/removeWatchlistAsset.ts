import type { AssetKey } from '@shared/contracts/api'
import { WatchlistRepository } from '@main/repositories/watchlistRepository'

export async function removeWatchlistAsset(assetKey: AssetKey): Promise<void> {
  const watchlistRepository = new WatchlistRepository()
  await watchlistRepository.removeAsset(assetKey)
}
