import type { WatchlistEntryDto } from '@shared/contracts/api'
import { toWatchlistEntryDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'
import { getWatchlistGroupRepository } from '@main/repositories/repositoryFactory'

export async function listWatchlistGroupAssets(groupId: string): Promise<WatchlistEntryDto[]> {
  if (!groupId.trim()) {
    throw new Error('分组 ID 不能为空')
  }

  const repository = getWatchlistGroupRepository()
  const assets = await repository.listGroupAssets(groupId)

  if (assets.length === 0) {
    return []
  }

  const assetRepository = new AssetRepository()
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
