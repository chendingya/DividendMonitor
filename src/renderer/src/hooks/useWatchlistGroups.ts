import { useCallback } from 'react'
import type { WatchlistGroupDto, WatchlistGroupUpsertDto } from '@shared/contracts/api'
import { watchlistApi } from '@renderer/services/watchlistApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useWatchlistGroups() {
  const { data: groups, loading, error, reload } = useFetch<WatchlistGroupDto[]>(() => watchlistApi.listGroups(), [])

  const createGroup = useCallback(
    async (request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> => {
      const group = await watchlistApi.createGroup(request)
      await reload().catch(() => {})
      return group
    },
    [reload]
  )

  const updateGroup = useCallback(
    async (id: string, request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> => {
      const group = await watchlistApi.updateGroup(id, request)
      await reload().catch(() => {})
      return group
    },
    [reload]
  )

  const deleteGroup = useCallback(
    async (id: string): Promise<void> => {
      await watchlistApi.deleteGroup(id)
      await reload().catch(() => {})
    },
    [reload]
  )

  const addToGroup = useCallback(
    async (groupId: string, assetKey: string): Promise<void> => {
      await watchlistApi.addToGroup({ groupId, assetKey })
      await reload().catch(() => {})
    },
    [reload]
  )

  const removeFromGroup = useCallback(
    async (groupId: string, assetKey: string): Promise<void> => {
      await watchlistApi.removeFromGroup({ groupId, assetKey })
      await reload().catch(() => {})
    },
    [reload]
  )

  return { groups: groups ?? [], loading, error, reload, createGroup, updateGroup, deleteGroup, addToGroup, removeFromGroup }
}
