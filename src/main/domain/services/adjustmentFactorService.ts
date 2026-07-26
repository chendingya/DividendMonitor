import type { DividendEvent, HistoricalPricePoint } from '@main/domain/entities/Stock'

export type PriceAdjustmentType = 'NONE' | 'QFTA' | 'HFTA'

/**
 * 单笔除权除息事件的复权系数（前复权视角）。
 * 以股权登记日收盘价为基准：
 *   factor = (登记日收盘价 - 每股现金分红) / (登记日收盘价 × (1 + 送转比例))
 * 送转比例 = (bonusSharePer10 + transferSharePer10) / 10
 * 缺少登记日收盘价时退化为 1，表示该事件不影响复权。
 */
export function computeEventFactor(event: DividendEvent): number {
  const referenceClose = event.referenceClosePrice
  if (!referenceClose || referenceClose <= 0) {
    return 1
  }
  const cashDividend = event.dividendPerShare ?? 0
  const bonusRatio = ((event.bonusSharePer10 ?? 0) + (event.transferSharePer10 ?? 0)) / 10
  const denominator = referenceClose * (1 + bonusRatio)
  if (denominator <= 0) {
    return 1
  }
  return (referenceClose - cashDividend) / denominator
}

/**
 * 前复权：以最新交易日为不动点（factor=1），对该日之前（exDate 严格大于该日）的所有
 * 除权除息事件因子连乘，得到连续价格序列。用于 K 线展示、估值分位与回测收益率计算。
 */
export function computeQfqCloses(
  priceHistory: HistoricalPricePoint[],
  dividendEvents: DividendEvent[]
): HistoricalPricePoint[] {
  if (priceHistory.length === 0) {
    return []
  }
  const events = dividendEvents
    .filter((event) => event.exDate)
    .sort((a, b) => (a.exDate! < b.exDate! ? -1 : 1))

  return priceHistory.map((point) => {
    let factor = 1
    for (const event of events) {
      if (event.exDate! > point.date) {
        factor *= computeEventFactor(event)
      }
    }
    return { ...point, qfqClose: roundTo(point.close * factor, 4) }
  })
}

/**
 * 后复权：以最早交易日为不动点（factor=1），对 exDate 小于等于该日的事件因子累乘到分母，
 * 将历史除权后的价格还原为未除权高价，使长期收益可叠加分红再投资。
 */
export function computeHfqCloses(
  priceHistory: HistoricalPricePoint[],
  dividendEvents: DividendEvent[]
): HistoricalPricePoint[] {
  if (priceHistory.length === 0) {
    return []
  }
  const events = dividendEvents
    .filter((event) => event.exDate)
    .sort((a, b) => (a.exDate! < b.exDate! ? -1 : 1))

  return priceHistory.map((point) => {
    let denominator = 1
    for (const event of events) {
      if (event.exDate! <= point.date) {
        denominator *= computeEventFactor(event)
      }
    }
    const safeDenominator = denominator > 0 ? denominator : 1
    return { ...point, hfqClose: roundTo(point.close / safeDenominator, 4) }
  })
}

export function applyAdjustment(
  priceHistory: HistoricalPricePoint[],
  dividendEvents: DividendEvent[],
  type: PriceAdjustmentType
): HistoricalPricePoint[] {
  switch (type) {
    case 'QFTA':
      return computeQfqCloses(priceHistory, dividendEvents)
    case 'HFTA':
      return computeHfqCloses(priceHistory, dividendEvents)
    case 'NONE':
    default:
      return priceHistory.map((point) => ({ ...point }))
  }
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
