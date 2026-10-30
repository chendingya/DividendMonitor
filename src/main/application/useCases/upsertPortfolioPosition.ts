import type { PortfolioPositionUpsertDto } from '@shared/contracts/api'
import { buildAssetKey } from '@shared/contracts/api'
import { getDividendRepository, getPortfolioRepository } from '@main/repositories/repositoryFactory'
import { toPortfolioCalendarDate } from '@main/application/mappers/portfolioDateMapper'

/** 日期变更前逆序还原已应用的会计调整，不从成交价猜测历史佣金。 */
async function restoreBeforeDateChange(request: PortfolioPositionUpsertDto): Promise<PortfolioPositionUpsertDto> {
  if (!request.id?.trim()) return request
  const existing = (await getPortfolioRepository().list()).find((position) => position.id === request.id?.trim())
  if (!existing?.corporateActionsAppliedUntil
    || toPortfolioCalendarDate(existing.openedAt) === toPortfolioCalendarDate(request.openedAt)) return request

  const code = request.code?.trim() || request.symbol?.trim()
  const assetType = request.assetType ?? (request.symbol ? 'STOCK' : undefined)
  const market = request.market ?? (request.symbol ? 'A_SHARE' : undefined)
  const requestKey = request.assetKey?.trim() || (assetType && market && code
    ? buildAssetKey(assetType, market, code) : undefined)
  if (requestKey === existing.assetKey && existing.tradePrice == null && request.tradePrice == null
    && request.avgCost === existing.avgCost && request.shares !== existing.shares) {
    throw new Error('该旧交易缺少原成交价且已应用除权，请分别修改持仓数量与买入日期。')
  }
  if (requestKey !== existing.assetKey || request.shares !== existing.shares || request.avgCost !== existing.avgCost
    || request.tradePrice !== existing.tradePrice || (request.direction ?? 'BUY') !== existing.direction) return request

  if (existing.avgCost <= 0) throw new Error('历史除权成本已截断为0，无法准确还原；请核实原始交易成本后再修改买入日期。')
  const openedAt = toPortfolioCalendarDate(existing.openedAt)
  const appliedUntil = existing.corporateActionsAppliedUntil
  const events = (await getDividendRepository().listPendingCorporateActions(existing.assetKey)).filter((event) =>
    event.exDate && openedAt && event.exDate >= openedAt && event.exDate <= appliedUntil
    && (event.status === undefined || event.status === 'IMPLEMENTED')
    && ((event.dividendPerShare ?? 0) !== 0 || (event.bonusSharePer10 ?? 0) !== 0 || (event.transferSharePer10 ?? 0) !== 0)
  ).reverse()
  if (!events.some((event) => event.exDate === appliedUntil)) {
    throw new Error('分红缓存缺少已应用的历史方案，无法准确还原成本；请补全分红数据后再修改买入日期。')
  }

  let shares = existing.shares
  let avgCost = existing.avgCost
  for (const event of events) {
    const ratio = 1 + ((event.bonusSharePer10 ?? 0) + (event.transferSharePer10 ?? 0)) / 10
    shares /= ratio
    avgCost = (avgCost + (event.dividendPerShare ?? 0)) * ratio
  }
  if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
    throw new Error('分红缓存的历史方案无法还原有效成本，请核实原始交易后再修改买入日期。')
  }
  return { ...request, shares, avgCost, corporateActionsAppliedUntil: '' }
}

export async function upsertPortfolioPosition(request: PortfolioPositionUpsertDto): Promise<void> {
  const repository = getPortfolioRepository()
  await repository.upsert(await restoreBeforeDateChange(request))
}
