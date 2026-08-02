import { useCallback, useState } from 'react'
import type { AssetQueryDto, WatchlistEntryDto } from '@shared/contracts/api'
import { watchlistApi } from '@renderer/services/watchlistApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useWatchlist() {
  const { data, loading, error, reload } = useFetch<WatchlistEntryDto[]>(() => watchlistApi.list(), [])
  const [mutatingAssetKey, setMutatingAssetKey] = useState<string | null>(null)

  const withMutation = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setMutatingAssetKey(key)
      try {
        await action()
        await reload()
      } finally {
        setMutatingAssetKey(null)
      }
    },
    [reload]
  )

  const add = useCallback(
    async (symbol: string) => {
      await withMutation(symbol, () => watchlistApi.add(symbol))
    },
    [withMutation]
  )

  const remove = useCallback(
    async (symbol: string) => {
      await withMutation(symbol, () => watchlistApi.remove(symbol))
    },
    [withMutation]
  )

  const addAsset = useCallback(
    async (request: AssetQueryDto) => {
      const mutatingKey = request.assetKey ?? request.code ?? request.symbol ?? ''
      await withMutation(mutatingKey, () => watchlistApi.addAsset(request))
    },
    [withMutation]
  )

  const removeAsset = useCallback(
    async (assetKey: string) => {
      await withMutation(assetKey, () => watchlistApi.removeAsset(assetKey))
    },
    [withMutation]
  )

  return { data: data ?? [], loading, error, reload, add, remove, addAsset, removeAsset, mutatingAssetKey }
}
