import type { WatchlistGroupDto } from '@shared/contracts/api'
import { getWatchlistGroupRepository } from '@main/repositories/repositoryFactory'

export async function listWatchlistGroups(): Promise<WatchlistGroupDto[]> {
  const repository = getWatchlistGroupRepository()
  return repository.listGroups()
}
