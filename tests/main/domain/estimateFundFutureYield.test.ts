import { describe, expect, it } from 'vitest'
import { estimateFundFutureYield } from '@main/domain/services/futureYieldEstimator'
import type { DividendEvent } from '@main/domain/entities/Stock'

function makeEvent(year: number, perShare: number): DividendEvent {
  return {
    year,
    dividendPerShare: perShare,
    referenceClosePrice: 1.0,
    source: 'eastmoney-fund'
  } as DividendEvent
}

describe('estimateFundFutureYield', () => {
  it('calculates baseline from most recent year', () => {
    const events = [makeEvent(2024, 0.05), makeEvent(2023, 0.04)]
    const result = estimateFundFutureYield({ latestPrice: 2.0, dividendEvents: events })
    expect(result.baseline.isAvailable).toBe(true)
    expect(result.baseline.estimatedFutureYield).toBeCloseTo(0.025, 6)
    expect(result.baseline.estimatedDividendPerShare).toBeCloseTo(0.05, 6)
  })

  it('calculates conservative from average of last 3 years', () => {
    const events = [
      makeEvent(2024, 0.06),
      makeEvent(2023, 0.04),
      makeEvent(2022, 0.05)
    ]
    const result = estimateFundFutureYield({ latestPrice: 2.0, dividendEvents: events })
    expect(result.conservative.isAvailable).toBe(true)
    expect(result.conservative.estimatedFutureYield).toBeCloseTo(0.025, 6)
    expect(result.conservative.estimatedDividendPerShare).toBeCloseTo(0.05, 6)
  })

  it('uses fewer years when only 1 year of data is available', () => {
    const events = [makeEvent(2024, 0.03)]
    const result = estimateFundFutureYield({ latestPrice: 1.5, dividendEvents: events })
    expect(result.conservative.isAvailable).toBe(true)
    expect(result.conservative.estimatedFutureYield).toBeCloseTo(0.02, 6)
    expect(result.baseline.estimatedFutureYield).toEqual(result.conservative.estimatedFutureYield)
  })

  it('uses 2 years when only 2 years of data are available', () => {
    const events = [makeEvent(2024, 0.04), makeEvent(2023, 0.02)]
    const result = estimateFundFutureYield({ latestPrice: 2.0, dividendEvents: events })
    expect(result.conservative.estimatedDividendPerShare).toBeCloseTo(0.03, 6)
  })

  it('returns unavailable when there are no dividend events', () => {
    const result = estimateFundFutureYield({ latestPrice: 2.0, dividendEvents: [] })
    expect(result.baseline.isAvailable).toBe(false)
    expect(result.conservative.isAvailable).toBe(false)
    expect(result.baseline.reason).toContain('暂无历史分配记录')
  })

  it('returns unavailable when latest price is zero', () => {
    const events = [makeEvent(2024, 0.05)]
    const result = estimateFundFutureYield({ latestPrice: 0, dividendEvents: events })
    expect(result.baseline.isAvailable).toBe(false)
    expect(result.conservative.isAvailable).toBe(false)
  })

  it('handles multiple events in the same year', () => {
    const events = [makeEvent(2024, 0.03), makeEvent(2024, 0.02)]
    const result = estimateFundFutureYield({ latestPrice: 2.0, dividendEvents: events })
    expect(result.baseline.estimatedDividendPerShare).toBeCloseTo(0.05, 6)
    expect(result.baseline.estimatedFutureYield).toBeCloseTo(0.025, 6)
  })

  it('produces steps with formatted numbers', () => {
    const events = [makeEvent(2024, 0.05)]
    const result = estimateFundFutureYield({ latestPrice: 2.0, dividendEvents: events })
    expect(result.baseline.steps.length).toBeGreaterThan(0)
    expect(result.baseline.steps[0]).toContain('2024')
  })

  it('baseline uses the most recent year after sorting', () => {
    const events = [makeEvent(2022, 0.03), makeEvent(2024, 0.06), makeEvent(2023, 0.04)]
    const result = estimateFundFutureYield({ latestPrice: 2.0, dividendEvents: events })
    expect(result.baseline.estimatedDividendPerShare).toBeCloseTo(0.06, 6)
    expect(result.baseline.inputs.baselineYear).toBe(2024)
  })
})
