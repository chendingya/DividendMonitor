import type { AssetKey } from '@shared/contracts/api'
import { getWatchlistRepository } from '@main/repositories/repositoryFactory'

export async function removeWatchlistAsset(assetKey: AssetKey): Promise<void> {
  const watchlistRepository = getWatchlistRepository()
  await watchlistRepository.removeAsset(assetKey)
}
