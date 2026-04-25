import { useCallback, useEffect, useRef, useState } from 'react'
import type { WatchlistItemDto } from '@shared/contracts/api'
import { watchlistApi } from '@renderer/services/watchlistApi'

export function useWatchlist() {
  const [data, setData] = useState<WatchlistItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mutatingSymbol, setMutatingSymbol] = useState<string | null>(null)
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
        setMutatingSymbol(symbol)
        setError(null)
      }

      try {
        await watchlistApi.add(symbol)
        await reload()
      } finally {
        if (mountedRef.current) {
          setMutatingSymbol(null)
        }
      }
    },
    [reload]
  )

  const remove = useCallback(
    async (symbol: string) => {
      if (mountedRef.current) {
        setMutatingSymbol(symbol)
        setError(null)
      }

      try {
        await watchlistApi.remove(symbol)
        await reload()
      } finally {
        if (mountedRef.current) {
          setMutatingSymbol(null)
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

  return { data, loading, error, reload, add, remove, mutatingSymbol }
}

