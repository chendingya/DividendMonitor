import { useEffect, useState } from 'react'
import type { StockDetailDto } from '@shared/contracts/api'
import { stockApi } from '@renderer/services/stockApi'

function isAShareSymbol(symbol: string) {
  return /^(6|0|3)\d{5}$/.test(symbol.trim())
}

export function useStockDetail(symbol: string) {
  const [data, setData] = useState<StockDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    async function load() {
      setLoading(true)
      setError(null)

      if (!isAShareSymbol(symbol)) {
        if (!disposed) {
          setData(null)
          setError(`仅支持A股6位代码，当前代码无效：${symbol}`)
          setLoading(false)
        }
        return
      }

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

