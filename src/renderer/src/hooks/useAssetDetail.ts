import { useMemo } from 'react'
import type { AssetDetailDto, AssetQueryDto } from '@shared/contracts/api'
import { assetApi } from '@renderer/services/assetApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useAssetDetail(request: AssetQueryDto | null) {
  const requestKey = useMemo(() => JSON.stringify(request ?? {}), [request])

  const { data, loading, error } = useFetch<AssetDetailDto | null>(
    async () => {
      if (!request) {
        return null
      }
      return assetApi.getDetail(request)
    },
    [requestKey, request]
  )

  return { data, loading, error }
}
