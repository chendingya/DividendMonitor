import type { WatchlistGroupDto, WatchlistGroupUpsertDto } from '@shared/contracts/api'
import { getWatchlistGroupRepository } from '@main/repositories/repositoryFactory'

export async function createWatchlistGroup(request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
  const name = request.name.trim()
  if (!name) {
    throw new Error('分组名称不能为空')
  }
  const repository = getWatchlistGroupRepository()
  return repository.createGroup({ ...request, name })
}
