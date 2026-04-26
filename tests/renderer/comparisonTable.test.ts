import { describe, expect, it } from 'vitest'
import { resolveComparisonMetricClassName } from '@renderer/components/comparison/ComparisonTable'

describe('resolveComparisonMetricClassName', () => {
  it('marks lower-better metrics as green for best and red for worst', () => {
    expect(
      resolveComparisonMetricClassName(6.45, {
        highlightHigh: 6.45,
        highlightLow: 22.19
      })
    ).toBe('comparison-metric-chip is-positive')

    expect(
      resolveComparisonMetricClassName(22.19, {
        highlightHigh: 6.45,
        highlightLow: 22.19
      })
    ).toBe('comparison-metric-chip is-cautious')
  })

  it('marks higher-better metrics as green for best and red for worst', () => {
    expect(
      resolveComparisonMetricClassName(8.72, {
        highlightHigh: 8.72,
        highlightLow: 1.22
      })
    ).toBe('comparison-metric-chip is-positive')

    expect(
      resolveComparisonMetricClassName(1.22, {
        highlightHigh: 8.72,
        highlightLow: 1.22
      })
    ).toBe('comparison-metric-chip is-cautious')
  })

  it('keeps uniform values neutral when all rows are equal', () => {
    expect(
      resolveComparisonMetricClassName(5, {
        highlightHigh: 5,
        highlightLow: 5
      })
    ).toBe('comparison-metric-chip')
  })
})
