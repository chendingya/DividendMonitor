import { buildAssetKey, parseAssetKey } from '@shared/contracts/api'
import type { MarketCode } from '@shared/contracts/api'
import type { PortfolioPosition } from '@renderer/services/portfolioStore'
import { normalizeCalendarDate, validateOptionalCalendarDate } from '@renderer/utils/calendarDate'

type TransferItem = Omit<PortfolioPosition, 'id' | 'updatedAt'>

export function serializePortfolioPositions(positions: PortfolioPosition[]): string {
  return JSON.stringify(positions.map((p) => ({
    assetKey: p.assetKey, assetType: p.assetType, market: p.market, code: p.code, symbol: p.symbol, name: p.name,
    direction: p.direction ?? 'BUY', shares: p.shares, avgCost: p.avgCost,
    tradePrice: p.tradePrice, openedAt: p.openedAt, riskLevel: p.riskLevel,
    corporateActionsAppliedUntil: validateOptionalCalendarDate(p.corporateActionsAppliedUntil, '除权除息游标')
  })), null, 2)
}

export function deserializePortfolioPositions(text: string): TransferItem[] {
  const data = JSON.parse(text) as TransferItem[]
  if (!Array.isArray(data) || data.length === 0) throw new Error('文件格式无效或没有持仓数据')
  return data.filter((item) => item && item.name && item.shares != null && item.avgCost != null).map((item) => {
    const parsed = item.assetKey ? parseAssetKey(item.assetKey) : null
    const assetType = item.assetType ?? parsed?.assetType ?? 'STOCK'
    const market: MarketCode = item.market ?? parsed?.market ?? (assetType === 'GOLD' || assetType === 'SILVER' ? 'SGE' : 'A_SHARE')
    const code = item.code ?? parsed?.code ?? item.symbol ?? ''
    return {
      assetKey: buildAssetKey(assetType, market, code), assetType, market, code,
      symbol: assetType === 'STOCK' ? item.symbol ?? code : undefined,
      name: item.name, direction: item.direction === 'SELL' ? 'SELL' : 'BUY',
      shares: Math.abs(item.shares), avgCost: Math.abs(item.avgCost),
      tradePrice: typeof item.tradePrice === 'number' && Number.isFinite(item.tradePrice) && item.tradePrice > 0 ? item.tradePrice : undefined,
      openedAt: normalizeCalendarDate(item.openedAt),
      corporateActionsAppliedUntil: validateOptionalCalendarDate(item.corporateActionsAppliedUntil, '除权除息游标'),
      riskLevel: item.riskLevel && ['LOW', 'MEDIUM', 'HIGH'].includes(item.riskLevel) ? item.riskLevel : undefined
    }
  })
}
