import type { WatchlistEntryDto } from '@shared/contracts/api'
import { loadWatchlistEntries } from '@main/application/useCases/loadWatchlistEntries'
import { getWatchlistGroupRepository } from '@main/repositories/repositoryFactory'

export async function listWatchlistGroupAssets(groupId: string): Promise<WatchlistEntryDto[]> {
  if (!groupId.trim()) {
    throw new Error('分组 ID 不能为空')
  }

  const repository = getWatchlistGroupRepository()
  const assets = await repository.listGroupAssets(groupId)

  return loadWatchlistEntries(assets)
}
