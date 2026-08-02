import { useCallback, useEffect, useRef, useState } from 'react'
import type { DependencyList, Dispatch, SetStateAction } from 'react'

type UseFetchOptions = {
  rethrow?: boolean
  initialLoading?: boolean
}

export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  options: UseFetchOptions = {}
): {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  setData: Dispatch<SetStateAction<T | null>>
} {
  const { rethrow = true, initialLoading = true } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(initialLoading)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reload = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }

    try {
      const result = await fetcherRef.current()
      if (mountedRef.current) {
        setData(result)
      }
    } catch (loadError) {
      if (mountedRef.current) {
        setError(loadError instanceof Error ? loadError.message : '请求失败')
      }
      if (rethrow) {
        throw loadError
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [rethrow])

  useEffect(() => {
    mountedRef.current = true
    void reload().catch(() => {})

    return () => {
      mountedRef.current = false
    }
    // reload 稳定（仅依赖 rethrow），deps 变化触发重载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps])

  return { data, loading, error, reload, setData }
}

export type UseFetchReturn<T> = ReturnType<typeof useFetch<T>>
