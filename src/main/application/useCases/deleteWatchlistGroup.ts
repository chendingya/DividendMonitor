import { getWatchlistGroupRepository } from '@main/repositories/repositoryFactory'

export async function deleteWatchlistGroup(id: string): Promise<void> {
  if (!id.trim()) {
    throw new Error('分组 ID 不能为空')
  }
  const repository = getWatchlistGroupRepository()
  return repository.deleteGroup(id)
}
