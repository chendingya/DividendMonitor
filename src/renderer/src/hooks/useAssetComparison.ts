import { useEffect, useMemo, useState } from 'react'
import type { AssetComparisonRowDto } from '@shared/contracts/api'
import { assetApi } from '@renderer/services/assetApi'

export function useAssetComparison(assetKeys: string[]) {
  const [data, setData] = useState<AssetComparisonRowDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const normalized = useMemo(() => assetKeys.filter((item) => item.trim().length > 0), [assetKeys])
  const requestKey = normalized.join('|')

  useEffect(() => {
    let disposed = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const rows = await assetApi.compare({
          items: normalized.map((assetKey) => ({ assetKey }))
        })
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
  }, [normalized, requestKey])

  return { data, loading, error }
}
