import { useEffect, useState } from 'react'
import type { ComparisonRowDto } from '@shared/contracts/api'
import { stockApi } from '@renderer/services/stockApi'

export function useComparison(symbols: string[]) {
  const [data, setData] = useState<ComparisonRowDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestKey = symbols.join('|')

  useEffect(() => {
    let disposed = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const rows = await stockApi.compare(symbols)
        if (!disposed) {
          setData(rows)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load comparison')
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
  }, [requestKey, symbols])

  return { data, loading, error }
}

