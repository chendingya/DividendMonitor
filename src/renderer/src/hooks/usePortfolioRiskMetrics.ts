import { useEffect, useMemo, useRef, useState } from 'react'
import type { PortfolioRiskMetricsDto } from '@shared/contracts/api'
import { portfolioApi } from '@renderer/services/portfolioApi'
import type { PortfolioRow } from '@renderer/hooks/usePortfolio'

export function usePortfolioRiskMetrics(rows: PortfolioRow[]) {
  const [data, setData] = useState<PortfolioRiskMetricsDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastKeyRef = useRef<string>('')

  const items = useMemo(
    () =>
      rows
        .filter((row) => row.assetKey && (row.marketValue ?? 0) > 0)
        .map((row) => ({
          assetKey: row.assetKey!,
          marketValue: row.marketValue ?? 0
        })),
    [rows]
  )

  useEffect(() => {
    if (items.length < 2) {
      setData(null)
      return
    }

    const key = items
      .map((item) => `${item.assetKey}:${item.marketValue.toFixed(2)}`)
      .sort()
      .join('|')
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key

    let disposed = false
    setLoading(true)
    setError(null)

    void portfolioApi
      .getRiskMetrics(items)
      .then((result) => {
        if (!disposed) {
          setData(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!disposed) {
          setError(err instanceof Error ? err.message : '获取组合风险数据失败')
          setLoading(false)
        }
      })

    return () => {
      disposed = true
    }
  }, [items])

  return { data, loading, error }
}
