import { getDividendRepository } from '@main/repositories/repositoryFactory'
import { getPortfolioRepository } from '@main/repositories/repositoryFactory'
import type {
  DividendHistoryRequest,
  DividendHistoryResult,
  DividendHistoryItem,
  DividendYearlySummary,
  DividendMonthlyTrend,
  DividendAssetSummary
} from '@shared/contracts/api'

export type {
  DividendHistoryRequest,
  DividendHistoryResult,
  DividendHistoryItem,
  DividendYearlySummary,
  DividendMonthlyTrend,
  DividendAssetSummary
} from '@shared/contracts/api'

/**
 * 分红统计中心：汇总所有持仓标的的分红事件，按年/月/个股维度聚合。
 * 仅统计用户持仓中存在的标的，且只计算各资产买入日（openedAt）之后的分红事件。
 * 未填写买入日期的持仓不参与统计（无法确定持有期间）。
 */
export async function listDividendHistory(request?: DividendHistoryRequest): Promise<DividendHistoryResult> {
  const dividendRepo = getDividendRepository()
  const portfolioRepo = getPortfolioRepository()
  const positions = await portfolioRepo.list()

  // 构建 assetKey -> { name, code, shares, openedAt } 映射
  // 只保留有 openedAt 的持仓（没有买入日期的无法确定持有期间，不参与统计）
  const assetInfo = new Map<string, { name: string; code: string; shares: number; openedAt: string }>()
  for (const pos of positions) {
    if (!pos.assetKey || !pos.openedAt) continue
    const existing = assetInfo.get(pos.assetKey)
    const shares = (existing?.shares ?? 0) + (pos.direction === 'SELL' ? -pos.shares : pos.shares)
    // 取最早的 openedAt 作为该资产的买入起始日
    const openedAt = existing
      ? (pos.openedAt < existing.openedAt ? pos.openedAt : existing.openedAt)
      : pos.openedAt
    assetInfo.set(pos.assetKey, {
      name: pos.name,
      code: pos.code ?? '',
      shares: Math.max(0, shares),
      openedAt
    })
  }

  const heldAssetKeys = [...assetInfo.keys()]
  const assetKeys = request?.assetKeys?.length
    ? request.assetKeys.filter((k) => heldAssetKeys.includes(k))
    : heldAssetKeys

  if (assetKeys.length === 0) {
    return { items: [], yearlySummary: [], monthlyTrend: [], assetSummary: [], totalAmount: 0 }
  }

  const events = dividendRepo.listAll({
    fromDate: request?.fromDate,
    toDate: request?.toDate,
    assetKeys
  })

  // 只保留各资产买入日之后的分红事件
  const items: DividendHistoryItem[] = []
  for (const event of events) {
    const info = assetInfo.get(event.assetKey)
    if (!info) continue
    const exDate = event.exDate ?? ''
    if (!exDate || exDate < info.openedAt) continue

    const heldShares = info.shares
    items.push({
      assetKey: event.assetKey,
      assetName: info.name,
      code: info.code,
      year: event.year,
      exDate,
      dividendPerShare: event.dividendPerShare,
      bonusSharePer10: event.bonusSharePer10,
      transferSharePer10: event.transferSharePer10,
      referenceClosePrice: event.referenceClosePrice,
      heldShares,
      estimatedDividendAmount: event.dividendPerShare * heldShares
    })
  }

  // 按年汇总
  const byYear = new Map<number, { total: number; count: number; assets: Set<string> }>()
  for (const item of items) {
    const entry = byYear.get(item.year) ?? { total: 0, count: 0, assets: new Set() }
    entry.total += item.estimatedDividendAmount
    entry.count += 1
    entry.assets.add(item.assetKey)
    byYear.set(item.year, entry)
  }
  const yearlySummary: DividendYearlySummary[] = [...byYear.entries()]
    .map(([year, entry]) => ({
      year,
      totalAmount: entry.total,
      eventCount: entry.count,
      assetCount: entry.assets.size
    }))
    .sort((a, b) => b.year - a.year)

  // 按月趋势
  const byMonth = new Map<string, number>()
  for (const item of items) {
    if (!item.exDate) continue
    const month = item.exDate.slice(0, 7)
    byMonth.set(month, (byMonth.get(month) ?? 0) + item.estimatedDividendAmount)
  }
  const monthlyTrend: DividendMonthlyTrend[] = [...byMonth.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // 按个股汇总
  const byAsset = new Map<string, { name: string; code: string; total: number; count: number; latest: string }>()
  for (const item of items) {
    const entry = byAsset.get(item.assetKey) ?? {
      name: item.assetName,
      code: item.code,
      total: 0,
      count: 0,
      latest: ''
    }
    entry.total += item.estimatedDividendAmount
    entry.count += 1
    if (item.exDate > entry.latest) entry.latest = item.exDate
    byAsset.set(item.assetKey, entry)
  }
  const assetSummary: DividendAssetSummary[] = [...byAsset.entries()]
    .map(([assetKey, entry]) => ({
      assetKey,
      assetName: entry.name,
      code: entry.code,
      totalAmount: entry.total,
      eventCount: entry.count,
      latestExDate: entry.latest
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)

  const totalAmount = items.reduce((sum, item) => sum + item.estimatedDividendAmount, 0)

  return { items, yearlySummary, monthlyTrend, assetSummary, totalAmount }
}
