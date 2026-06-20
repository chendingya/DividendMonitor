import type { WatchlistGroupDto, WatchlistGroupUpsertDto } from '@shared/contracts/api'
import { getWatchlistGroupRepository } from '@main/repositories/repositoryFactory'

export async function updateWatchlistGroup(id: string, request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
  if (!id.trim()) {
    throw new Error('分组 ID 不能为空')
  }
  if (request.name != null && !request.name.trim()) {
    throw new Error('分组名称不能为空')
  }
  const repository = getWatchlistGroupRepository()
  return repository.updateGroup(id, request)
}
