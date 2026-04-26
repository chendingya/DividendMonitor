import { useEffect, useState } from 'react'
import type { BacktestResultDto } from '@shared/contracts/api'
import { calculationApi } from '@renderer/services/calculationApi'

export function useAssetBacktest(assetKey: string | null, buyDate: string) {
  const [data, setData] = useState<BacktestResultDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    async function load() {
      setLoading(true)
      setError(null)

      if (!assetKey) {
        if (!disposed) {
          setData(null)
          setLoading(false)
        }
        return
      }

      try {
        const result = await calculationApi.runDividendReinvestmentBacktestForAsset({
          asset: { assetKey },
          buyDate
        })
        if (!disposed) {
          setData(result)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to run backtest')
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
  }, [assetKey, buyDate])

  return { data, loading, error }
}
