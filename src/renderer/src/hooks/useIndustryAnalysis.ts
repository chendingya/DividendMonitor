import { useEffect, useState } from 'react'
import type { IndustryAnalysisDto, IndustryDistributionItemDto } from '@shared/contracts/api'
import { getIndustryDesktopApi } from '@renderer/services/desktopApi'
import { useFetch } from '@renderer/hooks/useFetch'

type IndustryData = [IndustryAnalysisDto[], IndustryDistributionItemDto[]]

export function useIndustryAnalysis() {
  const { data, loading, error } = useFetch<IndustryData>(
    async () => {
      const api = getIndustryDesktopApi()
      return Promise.all([api.getAnalysis(), api.getDistribution()])
    },
    []
  )

  return {
    data: data?.[0] ?? [],
    distribution: data?.[1] ?? [],
    loading,
    error
  }
}

export function useIndustryBenchmark(industryName: string | undefined) {
  const [benchmark, setBenchmark] = useState<{
    avgDividendYield: number
    avgPeRatio: number
    avgRoe: number
    stockCount: number
  } | null>(null)

  useEffect(() => {
    if (!industryName) {
      setBenchmark(null)
      return
    }

    let disposed = false
    const api = getIndustryDesktopApi()

    api.getBenchmark(industryName).then((result) => {
      if (!disposed) setBenchmark(result)
    }).catch(() => {
      if (!disposed) setBenchmark(null)
    })

    return () => { disposed = true }
  }, [industryName])

  return benchmark
}
