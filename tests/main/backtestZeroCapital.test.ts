import { describe, expect, it } from 'vitest'
import { runDividendReinvestmentBacktest } from '@main/domain/services/dividendReinvestmentBacktestService'

const priceHistory = [
  { date: '2024-01-02', close: 1752.42, open: 1752.42, high: 1752.42, low: 1752.42, volume: 0 },
  { date: '2024-06-03', close: 1600, open: 1600, high: 1600, low: 1600, volume: 0 },
  { date: '2025-01-02', close: 1500, open: 1500, high: 1500, low: 1500, volume: 0 }
]

describe('runDividendReinvestmentBacktest with insufficient capital', () => {
  it('returns zero instead of NaN when capital cannot buy one lot', () => {
    const result = runDividendReinvestmentBacktest({
      symbol: '600519',
      buyDate: '2024-01-02',
      priceHistory,
      dividendEvents: [],
      initialCapital: 100000,
      includeFees: false
    })

    expect(result.finalShares).toBe(0)
    expect(result.initialCost).toBe(0)
    expect(result.totalReturn).toBe(0)
    expect(result.annualizedReturn).toBe(0)
    expect(Number.isNaN(result.totalReturn)).toBe(false)
    expect(Number.isNaN(result.annualizedReturn)).toBe(false)
  })
})
