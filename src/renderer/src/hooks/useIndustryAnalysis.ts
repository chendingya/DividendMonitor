import { useEffect, useState } from 'react'
import type { IndustryAnalysisDto, IndustryDistributionItemDto } from '@shared/contracts/api'
import { getIndustryDesktopApi } from '@renderer/services/desktopApi'

export function useIndustryAnalysis() {
  const [data, setData] = useState<IndustryAnalysisDto[]>([])
  const [distribution, setDistribution] = useState<IndustryDistributionItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    const api = getIndustryDesktopApi()

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [analysis, dist] = await Promise.all([
          api.getAnalysis(),
          api.getDistribution()
        ])
        if (!disposed) {
          setData(analysis)
          setDistribution(dist)
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : '加载行业分析失败')
        }
      } finally {
        if (!disposed) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => { disposed = true }
  }, [])

  return { data, distribution, loading, error }
}
