import type { WatchlistEntryDto } from '@shared/contracts/api'
import { toWatchlistEntryDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'
import { getWatchlistRepository } from '@main/repositories/repositoryFactory'

export async function listWatchlist(): Promise<WatchlistEntryDto[]> {
  const assetRepository = new AssetRepository()
  const watchlistRepository = getWatchlistRepository()
  const assets = await watchlistRepository.listAssets()

  if (assets.length === 0) {
    return []
  }

  const sources = await Promise.allSettled(assets.map((asset) => assetRepository.getDetail({ assetKey: asset.assetKey })))

  return sources
    .flatMap((source) => {
      if (source.status !== 'fulfilled') {
        return []
      }

      return [source.value]
    })
    .map(toWatchlistEntryDto)
}
