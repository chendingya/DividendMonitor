import { describe, expect, it } from 'vitest'
import {
  calculateRentalYield,
  calculatePriceToRentRatio,
  rebuildIndexSeries,
  calculateHousingDerivedMetrics
} from '@main/domain/services/housingCalculationService'

describe('housingCalculationService', () => {
  describe('calculateRentalYield', () => {
    it('computes annual rental yield from monthly rent per sqm', () => {
      // 租金 82 元/㎡·月，房价 47194 元/㎡ → 82×12/47194 ≈ 2.08%
      expect(calculateRentalYield(82, 47194)).toBeCloseTo(2.085, 2)
    })

    it('returns null when price is missing or zero', () => {
      expect(calculateRentalYield(82, 0)).toBeNull()
      expect(calculateRentalYield(82, undefined)).toBeNull()
      expect(calculateRentalYield(undefined, 47194)).toBeNull()
    })
  })

  describe('calculatePriceToRentRatio', () => {
    it('computes years to recover via rent', () => {
      // 47194 / (82×12) ≈ 47.96 年
      expect(calculatePriceToRentRatio(82, 47194)).toBeCloseTo(47.96, 1)
    })

    it('returns null without valid inputs', () => {
      expect(calculatePriceToRentRatio(0, 47194)).toBeNull()
      expect(calculatePriceToRentRatio(82, undefined)).toBeNull()
    })
  })

  describe('rebuildIndexSeries', () => {
    it('anchors first month at base value then chains MoM ratios', () => {
      const records = [
        { reportDate: '2026-03', secondHandMoM: 99.5 },
        { reportDate: '2026-04', secondHandMoM: 99.8 },
        { reportDate: '2026-05', secondHandMoM: 100.2 },
        { reportDate: '2026-06', secondHandMoM: 100.1 }
      ]
      const series = rebuildIndexSeries(records, 100)

      expect(series).toHaveLength(4)
      expect(series[0].index).toBeCloseTo(100, 6)
      expect(series[1].index).toBeCloseTo(100 * 0.998, 6)
      expect(series[2].index).toBeCloseTo(100 * 0.998 * 1.002, 6)
      expect(series[3].index).toBeCloseTo(100 * 0.998 * 1.002 * 1.001, 6)
    })

    it('skips records without MoM and preserves dates', () => {
      const records = [
        { reportDate: '2026-04', secondHandMoM: 99.8 },
        { reportDate: '2026-05' },
        { reportDate: '2026-06', secondHandMoM: 100.1 }
      ]
      const series = rebuildIndexSeries(records, 100)
      expect(series).toHaveLength(2)
      expect(series[0].reportDate).toBe('2026-04')
      expect(series[1].reportDate).toBe('2026-06')
      expect(series[1].index).toBeCloseTo(100 * 1.001, 6)
    })

    it('returns empty array for empty input', () => {
      expect(rebuildIndexSeries([], 100)).toEqual([])
    })
  })

  describe('calculateHousingDerivedMetrics', () => {
    it('derives both metrics when both inputs present', () => {
      const metrics = calculateHousingDerivedMetrics({ rentPerSqm: 82, pricePerSqm: 47194 })
      expect(metrics).toEqual({
        rentalYieldPercent: expect.closeTo(2.085, 2),
        priceToRentRatio: expect.closeTo(47.96, 1)
      })
    })

    it('returns empty object when data insufficient', () => {
      expect(calculateHousingDerivedMetrics({ rentPerSqm: 82 })).toEqual({})
      expect(calculateHousingDerivedMetrics({ pricePerSqm: 47194 })).toEqual({})
    })
  })
})
