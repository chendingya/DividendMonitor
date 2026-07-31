import { getPortfolioRepository, getDividendRepository } from '@main/repositories/repositoryFactory'
import { AssetRepository } from '@main/repositories/assetRepository'

export type CorporateActionAdjustment = {
  assetKey: string
  positionId: string
  exDate: string
  cashDividend: number
  bonusRatio: number
  sharesBefore: number
  sharesAfter: number
  avgCostBefore: number
  avgCostAfter: number
}

/**
 * 自动除权除息：扫描持仓中尚未应用的、且除权除息日已过往的分红/送转方案，
 * 对持仓成本基础进行会计修正：现金分红直接从每股成本扣减；送转股按比例摊薄成本、增加股数。
 *
 * 会计正确做法：
 *   现金分红：newCost = oldCost - dividendPerShare
 *   送转股：  newShares = oldShares × (1 + ratio), newCost = oldCost / (1 + ratio)
 *
 * 注意：这里不使用登记日收盘价因子（factor = (close - cash) / close）。
 * 因子法适用于价格序列复权（K 线/估值分位/回测），不适用于持仓成本基础调整——
 * 因为成本基础是会计事实，不应受登记日市场行情影响。现价 > 成本时因子法会少扣，
 * 现价 < 成本时会多扣，导致持仓收益率与会计实际不符。
 */
export async function applyCorporateActionsToPositions(): Promise<CorporateActionAdjustment[]> {
  const portfolioRepo = getPortfolioRepository()
  const dividendRepo = getDividendRepository()
  const positions = await portfolioRepo.list()
  const today = new Date().toISOString().slice(0, 10)
  const adjustments: CorporateActionAdjustment[] = []

  for (const position of positions) {
    // 未设置买入日期时，无法确定应从何时起计算除权除息。
    // 若此时强行应用，会把上市以来的全部历史分红/送转一次性扣进成本（成本价被压到接近 0、
    // 股数被历史送转虚增），严重偏离用户的真实买入成本。因此直接跳过该持仓，
    // 保持其成本价 = 用户录入的买入成本。要启用自动除权除息，请在持仓中填写买入日期。
    if (!position.openedAt) {
      continue
    }

    // 若本地尚无该标的的分红方案，先触发一次抓取并落库。
    // 这样打开持仓页即可自动补全，不依赖启动时的批量同步或用户曾打开过个股详情。
    if (dividendRepo.listByAsset(position.assetKey).length === 0) {
      try {
        // skipCache=true：强制重新抓取，避免旧快照里被误杀的分红方案覆盖本次落库。
        await new AssetRepository().getDetail({ assetKey: position.assetKey }, true)
      } catch (err) {
        console.warn(`[CorporateActions] 拉取 ${position.assetKey} 分红方案失败:`, (err as Error).message)
      }
    }

    // 只应用「持仓买入日之后」且已发生的分红，避免把上市以来累计历史分红一次性扣减。
    const openedAt = position.openedAt
    const pending = dividendRepo
      .listPendingCorporateActions(position.assetKey, position.corporateActionsAppliedUntil)
      .filter(
        (event) =>
          event.exDate != null &&
          event.exDate <= today &&
          event.exDate >= openedAt &&
          (event.status === undefined || event.status === 'IMPLEMENTED')
      )
    if (pending.length === 0) {
      continue
    }

    let shares = position.shares
    let avgCost = position.avgCost
    let lastExDate = position.corporateActionsAppliedUntil ?? ''

    for (const event of pending) {
      const cash = event.dividendPerShare ?? 0
      const bonusRatio = ((event.bonusSharePer10 ?? 0) + (event.transferSharePer10 ?? 0)) / 10

      if (cash === 0 && bonusRatio === 0) {
        continue
      }

      const newShares = shares * (1 + bonusRatio)
      // 会计成本基础调整（与 referenceClosePrice 无关）：
      //   送转股按比例摊薄成本；现金分红直接从每股成本扣减。
      let newAvgCost = bonusRatio > 0 ? avgCost / (1 + bonusRatio) : avgCost
      newAvgCost = Math.max(newAvgCost - cash, 0)

      adjustments.push({
        assetKey: position.assetKey,
        positionId: position.id,
        exDate: event.exDate!,
        cashDividend: cash,
        bonusRatio,
        sharesBefore: shares,
        sharesAfter: newShares,
        avgCostBefore: avgCost,
        avgCostAfter: newAvgCost
      })

      shares = newShares
      avgCost = newAvgCost

      if (event.exDate! > lastExDate) {
        lastExDate = event.exDate!
      }
    }

    if (lastExDate !== (position.corporateActionsAppliedUntil ?? '')) {
      await portfolioRepo.applyCorporateActionAdjustment(position.id, shares, avgCost, lastExDate)
    }
  }

  return adjustments
}
