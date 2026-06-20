import { getWatchlistGroupRepository } from '@main/repositories/repositoryFactory'

export async function getAssetGroupIds(assetKey: string): Promise<string[]> {
  if (!assetKey.trim()) {
    throw new Error('资产标识不能为空')
  }
  const repository = getWatchlistGroupRepository()
  return repository.getAssetGroupIds(assetKey)
}
