import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetQueryDto, WatchlistEntryDto } from '@shared/contracts/api'
import { watchlistApi } from '@renderer/services/watchlistApi'

export function useWatchlist() {
  const [data, setData] = useState<WatchlistEntryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mutatingAssetKey, setMutatingAssetKey] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const reload = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }

    try {
      const items = await watchlistApi.list()
      if (mountedRef.current) {
        setData(items)
      }
    } catch (loadError) {
      if (mountedRef.current) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load watchlist')
      }
      throw loadError
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  const add = useCallback(
    async (symbol: string) => {
      if (mountedRef.current) {
        setMutatingAssetKey(symbol)
        setError(null)
      }

      try {
        await watchlistApi.add(symbol)
        await reload()
      } finally {
        if (mountedRef.current) {
          setMutatingAssetKey(null)
        }
      }
    },
    [reload]
  )

  const remove = useCallback(
    async (symbol: string) => {
      if (mountedRef.current) {
        setMutatingAssetKey(symbol)
        setError(null)
      }

      try {
        await watchlistApi.remove(symbol)
        await reload()
      } finally {
        if (mountedRef.current) {
          setMutatingAssetKey(null)
        }
      }
    },
    [reload]
  )

  const addAsset = useCallback(
    async (request: AssetQueryDto) => {
      const mutatingKey = request.assetKey ?? request.code ?? request.symbol ?? ''
      if (mountedRef.current) {
        setMutatingAssetKey(mutatingKey)
        setError(null)
      }

      try {
        await watchlistApi.addAsset(request)
        await reload()
      } finally {
        if (mountedRef.current) {
          setMutatingAssetKey(null)
        }
      }
    },
    [reload]
  )

  const removeAsset = useCallback(
    async (assetKey: string) => {
      if (mountedRef.current) {
        setMutatingAssetKey(assetKey)
        setError(null)
      }

      try {
        await watchlistApi.removeAsset(assetKey)
        await reload()
      } finally {
        if (mountedRef.current) {
          setMutatingAssetKey(null)
        }
      }
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

  return { data, loading, error, reload, add, remove, addAsset, removeAsset, mutatingAssetKey }
}

