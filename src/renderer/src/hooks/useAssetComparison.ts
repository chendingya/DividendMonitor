import { useMemo } from 'react'
import type { AssetComparisonRowDto } from '@shared/contracts/api'
import { assetApi } from '@renderer/services/assetApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useAssetComparison(assetKeys: string[]) {
  const normalized = useMemo(() => assetKeys.filter((item) => item.trim().length > 0), [assetKeys])
  const requestKey = normalized.join('|')

  const { data, loading, error } = useFetch<AssetComparisonRowDto[]>(
    () =>
      assetApi.compare({
        items: normalized.map((assetKey) => ({ assetKey }))
      }),
    [requestKey, normalized]
  )

  return { data, loading, error }
}
