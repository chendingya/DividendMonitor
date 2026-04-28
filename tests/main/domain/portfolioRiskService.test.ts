import { describe, expect, it } from 'vitest'
import {
  calculatePortfolioRisk,
  type HoldingInfo
} from '@main/domain/services/portfolioRiskService'
import type { HistoricalPricePoint } from '@main/domain/entities/Stock'

function makePriceHistory(dates: string[], closes: number[]): HistoricalPricePoint[] {
  return dates.map((date, i) => ({ date, close: closes[i] }))
}

function generateRandomWalk(dates: string[], startPrice: number, volatility: number): HistoricalPricePoint[] {
  const closes: number[] = [startPrice]
  for (let i = 1; i < dates.length; i++) {
    const dailyReturn = (Math.random() - 0.5) * 2 * volatility
    closes.push(closes[i - 1] * (1 + dailyReturn))
  }
  return makePriceHistory(dates, closes)
}

describe('calculatePortfolioRisk', () => {
  const dates = Array.from({ length: 252 }, (_, i) => {
    const d = new Date(2025, 0, 1)
    d.setDate(d.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  it('returns undefined for empty holdings', () => {
    expect(calculatePortfolioRisk([])).toBeUndefined()
  })

  it('returns undefined when common date range is too short (< 20 days)', () => {
    const shortDates = Array.from({ length: 15 }, (_, i) => {
      const d = new Date(2025, 0, 1)
      d.setDate(d.getDate() + i)
      return d.toISOString().slice(0, 10)
    })

    const holdings: HoldingInfo[] = [
      {
        assetKey: 'STOCK:A_SHARE:600519',
        name: '贵州茅台',
        weight: 0.6,
        priceHistory: generateRandomWalk(shortDates, 1800, 0.015)
      },
      {
        assetKey: 'STOCK:A_SHARE:000858',
        name: '五粮液',
        weight: 0.4,
        priceHistory: generateRandomWalk(shortDates, 150, 0.02)
      }
    ]

    expect(calculatePortfolioRisk(holdings)).toBeUndefined()
  })

  it('calculates portfolio risk metrics for 2 assets with aligned dates', () => {
    const asset1 = generateRandomWalk(dates, 100, 0.015)
    const asset2 = generateRandomWalk(dates, 50, 0.02)

    const holdings: HoldingInfo[] = [
      { assetKey: 'A', name: 'Asset A', weight: 0.6, priceHistory: asset1 },
      { assetKey: 'B', name: 'Asset B', weight: 0.4, priceHistory: asset2 }
    ]

    const result = calculatePortfolioRisk(holdings)
    expect(result).toBeDefined()
    expect(result!.portfolioVolatility).toBeGreaterThan(0)
    expect(result!.maxDrawdown).toBeGreaterThanOrEqual(0)
    expect(result!.correlationMatrix.assetKeys).toEqual(['A', 'B'])
    expect(result!.correlationMatrix.matrix).toHaveLength(2)
    expect(result!.correlationMatrix.matrix[0]).toHaveLength(2)
  })

  it('correlation matrix diagonal is always 1', () => {
    const asset1 = generateRandomWalk(dates, 100, 0.015)
    const asset2 = generateRandomWalk(dates, 50, 0.02)
    const asset3 = generateRandomWalk(dates, 200, 0.01)

    const holdings: HoldingInfo[] = [
      { assetKey: 'A', name: 'Asset A', weight: 0.3, priceHistory: asset1 },
      { assetKey: 'B', name: 'Asset B', weight: 0.3, priceHistory: asset2 },
      { assetKey: 'C', name: 'Asset C', weight: 0.4, priceHistory: asset3 }
    ]

    const result = calculatePortfolioRisk(holdings)
    expect(result).toBeDefined()

    const { matrix } = result!.correlationMatrix
    for (let i = 0; i < matrix.length; i++) {
      expect(matrix[i][i]).toBeCloseTo(1, 5)
    }
  })

  it('correlation matrix is symmetric', () => {
    const asset1 = generateRandomWalk(dates, 100, 0.015)
    const asset2 = generateRandomWalk(dates, 50, 0.02)
    const asset3 = generateRandomWalk(dates, 200, 0.01)

    const holdings: HoldingInfo[] = [
      { assetKey: 'A', name: 'A', weight: 0.3, priceHistory: asset1 },
      { assetKey: 'B', name: 'B', weight: 0.3, priceHistory: asset2 },
      { assetKey: 'C', name: 'C', weight: 0.4, priceHistory: asset3 }
    ]

    const result = calculatePortfolioRisk(holdings)
    expect(result).toBeDefined()

    const { matrix } = result!.correlationMatrix
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix.length; j++) {
        expect(matrix[i][j]).toBeCloseTo(matrix[j][i], 10)
      }
    }
  })

  it('single asset has correlation matrix [[1]]', () => {
    const asset = generateRandomWalk(dates, 100, 0.015)
    const holdings: HoldingInfo[] = [
      { assetKey: 'A', name: 'Asset A', weight: 1, priceHistory: asset }
    ]

    const result = calculatePortfolioRisk(holdings)
    expect(result).toBeDefined()
    expect(result!.correlationMatrix.matrix).toEqual([[1]])
    expect(result!.correlationMatrix.assetKeys).toEqual(['A'])
  })

  it('perfectly correlated identical price series yield correlation of 1', () => {
    const priceHistory = generateRandomWalk(dates, 100, 0.015)

    const holdings: HoldingInfo[] = [
      { assetKey: 'A', name: 'A', weight: 0.5, priceHistory },
      { assetKey: 'B', name: 'B', weight: 0.5, priceHistory }
    ]

    const result = calculatePortfolioRisk(holdings)
    expect(result).toBeDefined()

    const corr = result!.correlationMatrix.matrix[0][1]
    expect(corr).toBeCloseTo(1, 2)
  })

  it('aligns dates correctly when assets have overlapping but different date ranges', () => {
    const commonDates = dates.slice(100, 200)
    const extraEarly = dates.slice(0, 100)
    const extraLate = dates.slice(200)

    const asset1 = makePriceHistory(
      [...extraEarly, ...commonDates].map((d) => d),
      [...Array(100).fill(0).map(() => 80 + Math.random() * 20), ...Array(100).fill(0).map(() => 100 + Math.random() * 10)]
    )

    const asset2 = makePriceHistory(
      [...commonDates, ...extraLate].map((d) => d),
      [...Array(100).fill(0).map(() => 50 + Math.random() * 10), ...Array(52).fill(0).map(() => 55 + Math.random() * 15)]
    )

    const holdings: HoldingInfo[] = [
      { assetKey: 'A', name: 'A', weight: 0.6, priceHistory: asset1 },
      { assetKey: 'B', name: 'B', weight: 0.4, priceHistory: asset2 }
    ]

    const result = calculatePortfolioRisk(holdings)
    expect(result).toBeDefined()
    expect(result!.portfolioVolatility).toBeGreaterThan(0)
  })

  it('maxDrawdown is 0 when prices only go up', () => {
    const upDates = Array.from({ length: 100 }, (_, i) => {
      const d = new Date(2025, 0, 1)
      d.setDate(d.getDate() + i)
      return d.toISOString().slice(0, 10)
    })

    const upCloses = Array.from({ length: 100 }, (_, i) => 100 * (1 + i * 0.001))
    const upPriceHistory = makePriceHistory(upDates, upCloses)

    const holdings: HoldingInfo[] = [
      { assetKey: 'A', name: 'A', weight: 1, priceHistory: upPriceHistory }
    ]

    const result = calculatePortfolioRisk(holdings)
    expect(result).toBeDefined()
    expect(result!.maxDrawdown).toBeCloseTo(0, 2)
  })
})
