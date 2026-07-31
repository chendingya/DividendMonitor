import { describe, it, expect } from 'vitest'
import type { DividendEvent, HistoricalPricePoint } from '@main/domain/entities/Stock'
import { computeEventFactor, computeQfqCloses, computeHfqCloses } from '@main/domain/services/adjustmentFactorService'

function price(dates: string[], closes: number[]): HistoricalPricePoint[] {
  return dates.map((date, i) => ({ date, close: closes[i] }))
}

function cashEvent(overrides: Partial<DividendEvent>): DividendEvent {
  return { year: 2023, dividendPerShare: 0, referenceClosePrice: 0, source: 'test', status: 'IMPLEMENTED', ...overrides }
}

describe('computeEventFactor', () => {
  it('纯现金分红：因子 = (R - d) / R', () => {
    const event = cashEvent({ dividendPerShare: 1, referenceClosePrice: 10 })
    expect(computeEventFactor(event)).toBeCloseTo(0.9, 6)
  })

  it('送转股：因子 = (R - d) / (R × (1 + s))', () => {
    const event = cashEvent({ dividendPerShare: 0, bonusSharePer10: 10, referenceClosePrice: 20 })
    // (20 - 0) / (20 × 2) = 0.5
    expect(computeEventFactor(event)).toBeCloseTo(0.5, 6)
  })

  it('缺少登记日收盘价时退化为 1', () => {
    const event = cashEvent({ dividendPerShare: 1, referenceClosePrice: 0 })
    expect(computeEventFactor(event)).toBe(1)
  })
})

describe('computeQfqCloses', () => {
  it('现金分红使历史价压低、除权前后序列连续', () => {
    const prices = price(
      ['2023-06-01', '2023-06-08', '2023-06-09', '2023-06-15'],
      [20, 20, 10, 10]
    )
    // 2023-06-09 除权，登记日 06-08 收盘 20，每股分红 10 -> factor = 0.5
    const event = cashEvent({ dividendPerShare: 10, referenceClosePrice: 20, exDate: '2023-06-09' })
    const result = computeQfqCloses(prices, [event])

    expect(result[3].qfqClose).toBeCloseTo(10, 4) // 最新日不动
    expect(result[2].qfqClose).toBeCloseTo(10, 4) // 除权当日不乘
    expect(result[1].qfqClose).toBeCloseTo(10, 4) // 登记日 < exDate，压低后连续
    expect(result[0].qfqClose).toBeCloseTo(10, 4)
  })

  it('送转股同样得到连续前复权序列', () => {
    const prices = price(['2023-06-08', '2023-06-09'], [20, 10])
    const event = cashEvent({ bonusSharePer10: 10, referenceClosePrice: 20, exDate: '2023-06-09' })
    const result = computeQfqCloses(prices, [event])
    expect(result[0].qfqClose).toBeCloseTo(10, 4)
    expect(result[1].qfqClose).toBeCloseTo(10, 4)
  })
})

describe('computeHfqCloses', () => {
  it('后复权：最早日不动，除权后价格被还原为高价', () => {
    const prices = price(['2023-06-08', '2023-06-09'], [20, 10])
    const event = cashEvent({ dividendPerShare: 10, referenceClosePrice: 20, exDate: '2023-06-09' })
    const result = computeHfqCloses(prices, [event])
    expect(result[0].hfqClose).toBeCloseTo(20, 4) // 最早日不动
    expect(result[1].hfqClose).toBeCloseTo(20, 4) // 除权后还原，连续
  })
})
