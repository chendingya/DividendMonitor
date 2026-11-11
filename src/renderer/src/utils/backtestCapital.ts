import type { BacktestResultDto } from '@shared/contracts/api'

const MIN_LOT_SIZE = 100

/**
 * 初始资金不足以买入一手（100 股）时，回测会返回 0 股与 0 成本，
 * 需要在界面明确说明，避免用户把 0% 当成真实结果。
 */
export function getInsufficientCapitalHint(result: BacktestResultDto): string | null {
  if (result.finalShares > 0 && result.initialCost > 0) {
    return null
  }

  const minLotCost = result.buyPrice * MIN_LOT_SIZE
  if (!Number.isFinite(minLotCost) || minLotCost <= 0) {
    return null
  }

  return `初始资金不足一手：按买入价需约 ¥${minLotCost.toLocaleString('zh-CN', {
    maximumFractionDigits: 0
  })}（${MIN_LOT_SIZE} 股），本次回测未能建仓，收益率与分红均为 0。`
}
