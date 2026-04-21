import { useEffect, useState } from 'react'
import type { StockDetailDto } from '@shared/contracts/api'
import { stockApi } from '@renderer/services/api/stockApi'

export function useStockDetail(symbol: string) {
  const [data, setData] = useState<StockDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const detail = await stockApi.getDetail(symbol)
        if (!disposed) {
          setData(detail)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load stock detail')
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
  }, [symbol])

  return { data, loading, error }
}
