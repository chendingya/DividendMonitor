import type { UpcomingDividendDto } from '@shared/contracts/api'
import { getPortfolioRepository } from '@main/repositories/repositoryFactory'
import { DividendRepository } from '@main/repositories/dividendRepository'

export async function listUpcomingDividends(): Promise<UpcomingDividendDto[]> {
  const portfolioRepo = getPortfolioRepository()
  const positions = await portfolioRepo.list()

  const assetInfo = new Map<
    string,
    { name: string; code: string; shares: number; assetType: 'STOCK' | 'ETF' | 'FUND' }
  >()
  for (const pos of positions) {
    if (!pos.assetKey || !pos.openedAt) continue
    const existing = assetInfo.get(pos.assetKey)
    const delta = pos.direction === 'SELL' ? -pos.shares : pos.shares
    const nextShares = Math.max(0, (existing?.shares ?? 0) + delta)
    const assetType = pos.assetType as 'STOCK' | 'ETF' | 'FUND'
    if (!existing) {
      assetInfo.set(pos.assetKey, {
        name: pos.name,
        code: pos.code ?? '',
        shares: nextShares,
        assetType
      })
    } else {
      existing.shares = nextShares
    }
  }

  const heldAssetKeys = [...assetInfo.entries()]
    .filter(([, info]) => info.shares > 0)
    .map(([key]) => key)
  if (heldAssetKeys.length === 0) return []

  const dividendRepo = new DividendRepository()
  const currentYear = new Date().getFullYear()
  const events = dividendRepo.listUpcomingByAssetKeys(heldAssetKeys, currentYear)

  return events
    .filter((e) => (assetInfo.get(e.assetKey)?.shares ?? 0) > 0)
    .map((e) => {
      const info = assetInfo.get(e.assetKey)!
      return {
        assetKey: e.assetKey,
        assetType: info.assetType,
        code: info.code,
        name: info.name,
        heldShares: info.shares,
        announceDate: e.announceDate,
        expectedExDate: e.exDate,
        expectedPayDate: e.payDate,
        dividendPerShare: e.dividendPerShare,
        announcementProgress: e.announcementProgress ?? '',
        status: (e.status === 'IMPLEMENTED' ? 'PLANNED' : e.status) as 'PLANNED' | 'IN_PROGRESS',
        estimatedAmount: e.dividendPerShare * info.shares
      }
    })
}