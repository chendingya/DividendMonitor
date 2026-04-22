import { useEffect, useState } from 'react'
import type { WatchlistItemDto } from '@shared/contracts/api'
import { watchlistApi } from '@renderer/services/watchlistApi'

export function useWatchlist() {
  const [data, setData] = useState<WatchlistItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const items = await watchlistApi.list()
        if (!disposed) {
          setData(items)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load watchlist')
        }
      } finally {
        if (!disposed) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      disposed = true
    }
  }, [])

  return { data, loading, error }
}

