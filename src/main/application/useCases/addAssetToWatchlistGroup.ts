import type { WatchlistGroupAssetActionDto } from '@shared/contracts/api'
import { getWatchlistGroupRepository } from '@main/repositories/repositoryFactory'

export async function addAssetToWatchlistGroup(request: WatchlistGroupAssetActionDto): Promise<void> {
  if (!request.groupId.trim()) {
    throw new Error('分组 ID 不能为空')
  }
  if (!request.assetKey.trim()) {
    throw new Error('资产标识不能为空')
  }
  const repository = getWatchlistGroupRepository()
  return repository.addToGroup(request.groupId, request.assetKey)
}
