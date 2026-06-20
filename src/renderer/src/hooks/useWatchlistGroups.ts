import { useCallback, useEffect, useRef, useState } from 'react'
import type { WatchlistGroupDto, WatchlistGroupUpsertDto } from '@shared/contracts/api'
import { watchlistApi } from '@renderer/services/watchlistApi'

export function useWatchlistGroups() {
  const [groups, setGroups] = useState<WatchlistGroupDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const reload = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }

    try {
      const data = await watchlistApi.listGroups()
      if (mountedRef.current) {
        setGroups(data)
      }
    } catch (loadError) {
      if (mountedRef.current) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load groups')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  const createGroup = useCallback(
    async (request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> => {
      const group = await watchlistApi.createGroup(request)
      await reload()
      return group
    },
    [reload]
  )

  const updateGroup = useCallback(
    async (id: string, request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> => {
      const group = await watchlistApi.updateGroup(id, request)
      await reload()
      return group
    },
    [reload]
  )

  const deleteGroup = useCallback(
    async (id: string): Promise<void> => {
      await watchlistApi.deleteGroup(id)
      await reload()
    },
    [reload]
  )

  const addToGroup = useCallback(
    async (groupId: string, assetKey: string): Promise<void> => {
      await watchlistApi.addToGroup({ groupId, assetKey })
      await reload()
    },
    [reload]
  )

  const removeFromGroup = useCallback(
    async (groupId: string, assetKey: string): Promise<void> => {
      await watchlistApi.removeFromGroup({ groupId, assetKey })
      await reload()
    },
    [reload]
  )

  useEffect(() => {
    mountedRef.current = true
    void reload().catch(() => {})

    return () => {
      mountedRef.current = false
    }
  }, [reload])

  return { groups, loading, error, reload, createGroup, updateGroup, deleteGroup, addToGroup, removeFromGroup }
}
