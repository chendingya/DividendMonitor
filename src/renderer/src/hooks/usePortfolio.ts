import { useEffect, useMemo, useState } from 'react'
import type { AssetDetailDto } from '@shared/contracts/api'
import { getYieldSnapshot } from '@renderer/pages/dashboardMetrics'
import { getRecentAssetKeys } from '@renderer/services/routeContext'
import { assetApi } from '@renderer/services/assetApi'
import {
  listPortfolioPositionsFromBackend,
  type PortfolioPosition
} from '@renderer/services/portfolioStore'

export type PortfolioRow = PortfolioPosition & {
  latestPrice?: number
  marketValue?: number
  yieldMetric?: number
  yieldLabel?: string
  positionReturn?: number
  netShares: number
  transactionCount: number
  netCostAmount: number
}

export type PortfolioOpportunity = PortfolioRow & {
  displayCode: string
  yieldMetric: number
  yieldLabel: string
}

export type RecentBrowseItem = {
  assetKey: string
  assetType?: string
  symbol: string
  title: string
  subtitle: string
}

export function usePortfolio() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([])
  const [details, setDetails] = useState<Record<string, AssetDetailDto>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recentAssetKeys = useMemo(() => getRecentAssetKeys(), [])

  useEffect(() => {
    let disposed = false
    void listPortfolioPositionsFromBackend()
      .then((items) => {
        if (!disposed) {
          setPositions(items)
        }
      })
      .catch((err) => {
        if (!disposed) {
          setError(err instanceof Error ? err.message : '加载持仓失败')
        }
      })

    return () => {
      disposed = true
    }
  }, [])

  const rows = useMemo<PortfolioRow[]>(() => {
    const byKey = new Map<string, PortfolioRow>()

    for (const position of positions) {
      const direction = position.direction === 'SELL' ? 'SELL' : 'BUY'
      const signedShares = direction === 'SELL' ? -Math.abs(position.shares) : Math.abs(position.shares)
      const key = position.assetKey ? `asset:${position.assetKey}` : position.symbol ? `symbol:${position.symbol}` : `item:${position.id}`
      const current = byKey.get(key)

      if (!current) {
        byKey.set(key, {
          ...position,
          direction: 'BUY',
          shares: Math.abs(position.shares),
          netShares: signedShares,
          transactionCount: 1,
          netCostAmount: signedShares * position.avgCost,
          latestPrice: undefined,
          marketValue: undefined,
          yieldMetric: undefined,
          yieldLabel: undefined,
          positionReturn: undefined
        })
        continue
      }

      current.netShares += signedShares
      current.netCostAmount += signedShares * position.avgCost
      current.transactionCount += 1
      current.updatedAt = position.updatedAt > current.updatedAt ? position.updatedAt : current.updatedAt
    }

    const merged = [...byKey.values()].map((row) => {
      const detailKey = row.assetKey ?? row.symbol ?? row.id
      const detail = details[detailKey]
      const latestPrice = detail?.latestPrice
      const normalizedNetShares = Math.max(0, row.netShares)
      const marketValue = latestPrice == null ? undefined : latestPrice * normalizedNetShares
      const avgCost = normalizedNetShares > 0 ? row.netCostAmount / normalizedNetShares : row.avgCost
      const costValue = avgCost > 0 ? avgCost * normalizedNetShares : 0
      const positionReturn = marketValue == null || costValue <= 0 ? undefined : marketValue / costValue - 1
      const yieldSnapshot = getYieldSnapshot(detail)

      return {
        ...row,
        shares: normalizedNetShares,
        netShares: normalizedNetShares,
        avgCost: avgCost > 0 ? avgCost : row.avgCost,
        latestPrice,
        marketValue: normalizedNetShares > 0 ? marketValue : 0,
        yieldMetric: normalizedNetShares > 0 ? yieldSnapshot.value : undefined,
        yieldLabel: yieldSnapshot.label,
        positionReturn
      }
    })

    return merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [details, positions])

  const totalCost = useMemo(() => rows.reduce((sum, item) => sum + item.avgCost * item.shares, 0), [rows])
  const totalValue = useMemo(() => rows.reduce((sum, item) => sum + (item.marketValue ?? 0), 0), [rows])
  const totalReturn = useMemo(() => (totalCost <= 0 ? 0 : totalValue / totalCost - 1), [totalCost, totalValue])
  const avgYieldMetric = useMemo(() => {
    const available = rows.filter((row) => row.yieldMetric != null)
    if (available.length === 0) {
      return undefined
    }
    const weighted = available
      .map((item) => {
        const weight = item.marketValue ?? item.avgCost * item.shares
        return { weight, yield: item.yieldMetric ?? 0 }
      })
      .filter((item) => item.weight > 0)

    if (weighted.length === 0) {
      return undefined
    }

    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0)
    const weightedYield = weighted.reduce((sum, item) => sum + item.yield * item.weight, 0)
    return weightedYield / totalWeight
  }, [rows])

  const opportunities = useMemo<PortfolioOpportunity[]>(() => {
    return [...rows]
      .map((row) => ({
        ...row,
        displayCode: row.symbol ?? row.code ?? row.assetKey ?? row.id
      }))
      .filter((row): row is PortfolioOpportunity => row.yieldMetric != null && row.yieldLabel != null)
      .sort((a, b) => (b.yieldMetric ?? 0) - (a.yieldMetric ?? 0))
      .slice(0, 4)
  }, [rows])

  const recentItems = useMemo<RecentBrowseItem[]>(() => {
    return recentAssetKeys.slice(0, 5).map((assetKey) => {
      const detail = details[assetKey]
      return {
        assetKey,
        assetType: detail?.assetType,
        symbol: detail?.symbol ?? detail?.code ?? assetKey,
        title: detail?.name ?? assetKey,
        subtitle: `${detail?.symbol ?? detail?.code ?? assetKey} · ${detail?.assetType ?? '最近浏览'}`
      }
    })
  }, [details, recentAssetKeys])

  useEffect(() => {
    if (positions.length === 0) {
      setDetails({})
      return
    }
    let disposed = false
    setRefreshing(true)
    const assetKeys = positions
      .map((position) => position.assetKey)
      .filter((item): item is string => Boolean(item))
    void Promise.allSettled(assetKeys.map((assetKey) => assetApi.getDetail({ assetKey }))).then((results) => {
      if (disposed) {
        return
      }
      const next: Record<string, AssetDetailDto> = {}
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          next[result.value.assetKey] = result.value
        }
      })
      setDetails(next)
      setRefreshing(false)
    })
    return () => {
      disposed = true
    }
  }, [positions])

  async function refreshQuotes() {
    if (positions.length === 0) {
      return
    }
    setRefreshing(true)
    const assetKeys = positions
      .map((position) => position.assetKey)
      .filter((item): item is string => Boolean(item))
    const results = await Promise.allSettled(assetKeys.map((assetKey) => assetApi.getDetail({ assetKey })))
    const next: Record<string, AssetDetailDto> = {}
    let failed = 0
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        next[result.value.assetKey] = result.value
      } else {
        failed += 1
      }
    })
    setDetails(next)
    setRefreshing(false)
    return { failed }
  }

  async function reload() {
    const items = await listPortfolioPositionsFromBackend()
    setPositions(items)
  }

  return {
    positions,
    rows,
    details,
    refreshing,
    error,
    recentAssetKeys,
    totalCost,
    totalValue,
    totalReturn,
    avgYieldMetric,
    opportunities,
    recentItems,
    refreshQuotes,
    reload,
    setError
  }
}
