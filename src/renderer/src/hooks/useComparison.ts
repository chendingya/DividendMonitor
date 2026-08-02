import { useMemo } from 'react'
import type { ComparisonRowDto } from '@shared/contracts/api'
import { stockApi } from '@renderer/services/stockApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useComparison(symbols: string[]) {
  const requestKey = useMemo(() => symbols.join('|'), [symbols])

  const { data, loading, error } = useFetch<ComparisonRowDto[]>(
    () => stockApi.compare(symbols),
    [requestKey, symbols]
  )

  return { data, loading, error }
}
