import { useEffect, useMemo, useState } from 'react'
import type { AssetDetailDto, AssetQueryDto } from '@shared/contracts/api'
import { assetApi } from '@renderer/services/assetApi'

export function useAssetDetail(request: AssetQueryDto | null) {
  const [data, setData] = useState<AssetDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestKey = useMemo(() => JSON.stringify(request ?? {}), [request])

  useEffect(() => {
    let disposed = false

    async function load() {
      setLoading(true)
      setError(null)

      if (!request) {
        if (!disposed) {
          setData(null)
          setLoading(false)
        }
        return
      }

      try {
        const detail = await assetApi.getDetail(request)
        if (!disposed) {
          setData(detail)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load asset detail')
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
  }, [request, requestKey])

  return { data, loading, error }
}
