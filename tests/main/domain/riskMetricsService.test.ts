import { describe, expect, it } from 'vitest'
import { calculateRiskMetrics } from '@main/domain/services/riskMetricsService'

function makePrices(closes: number[]) {
  return closes.map((close, i) => ({
    date: `2024-${String(i + 1).padStart(2, '0')}-01`,
    close
  }))
}

describe('calculateRiskMetrics', () => {
  it('returns undefined for fewer than 20 data points', () => {
    const prices = makePrices(Array.from({ length: 19 }, (_, i) => 10 + i * 0.1))
    expect(calculateRiskMetrics(prices)).toBeUndefined()
  })

  it('returns undefined for empty price history', () => {
    expect(calculateRiskMetrics([])).toBeUndefined()
  })

  it('returns zero volatility for constant prices', () => {
    const prices = makePrices(Array.from({ length: 30 }, () => 10))
    const result = calculateRiskMetrics(prices)
    expect(result).toBeDefined()
    expect(result!.annualVolatility).toBe(0)
  })

  it('calculates positive volatility for varying prices', () => {
    const prices = makePrices(Array.from({ length: 252 }, (_, i) => 100 + Math.sin(i / 10) * 5))
    const result = calculateRiskMetrics(prices)
    expect(result).toBeDefined()
    expect(result!.annualVolatility).toBeGreaterThan(0)
  })

  it('computes sharpe ratio for upward-trending prices', () => {
    const prices = makePrices(Array.from({ length: 100 }, (_, i) => 10 + i * 0.1))
    const result = calculateRiskMetrics(prices)
    expect(result).toBeDefined()
    expect(result!.annualVolatility).toBeGreaterThan(0)
    // Upward trend with low volatility → positive sharpe
    expect(result!.sharpeRatio).toBeGreaterThan(0)
  })

  it('skips entries with zero or negative close price', () => {
    const prices = makePrices([
      ...Array.from({ length: 50 }, (_, i) => (i === 25 ? 0 : 10 + i * 0.1))
    ])
    const result = calculateRiskMetrics(prices)
    // Should still compute with remaining valid returns
    expect(result).toBeDefined()
    expect(result!.annualVolatility).toBeGreaterThan(0)
  })

  it('returns consistent results with same input', () => {
    const prices = makePrices(Array.from({ length: 100 }, (_, i) => 10 + i * 0.05 + (i % 3) * 0.02))
    const result1 = calculateRiskMetrics(prices)
    const result2 = calculateRiskMetrics(prices)
    expect(result1?.annualVolatility).toBe(result2?.annualVolatility)
    expect(result1?.sharpeRatio).toBe(result2?.sharpeRatio)
  })

  it('returns zero sharpe when volatility is zero', () => {
    const prices = makePrices(Array.from({ length: 30 }, () => 10))
    const result = calculateRiskMetrics(prices)
    expect(result).toBeDefined()
    expect(result!.sharpeRatio).toBe(0)
  })
})
