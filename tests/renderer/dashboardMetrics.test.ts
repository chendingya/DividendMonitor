import { describe, expect, it } from 'vitest'
import type { AssetDetailDto } from '@shared/contracts/api'
import { getAverageYield, getYieldSnapshot } from '@renderer/pages/dashboardMetrics'

function createDetail(overrides: Partial<AssetDetailDto>): AssetDetailDto {
  return {
    assetKey: 'ETF:A_SHARE:510880',
    assetType: 'ETF',
    market: 'A_SHARE',
    code: '510880',
    name: '红利ETF',
    latestPrice: 1.23,
    dataSource: 'mock',
    yieldBasis: '现金分配',
    yearlyYields: [],
    dividendEvents: [],
    futureYieldEstimate: {
      isAvailable: false,
      estimatedFutureYield: 0,
      estimatedDividendPerShare: 0,
      latestPrice: 1.23,
      basis: 'mock'
    },
    futureYieldEstimates: [],
    ...overrides
  }
}

describe('dashboardMetrics', () => {
  it('uses future yield for assets with available estimate', () => {
    const detail = createDetail({
      assetType: 'STOCK',
      code: '600519',
      symbol: '600519',
      name: '贵州茅台',
      futureYieldEstimate: {
        isAvailable: true,
        estimatedFutureYield: 0.0312,
        estimatedDividendPerShare: 52.76,
        latestPrice: 1691,
        basis: 'manual'
      }
    })

    expect(getYieldSnapshot(detail)).toEqual({
      value: 0.0312,
      label: '未来股息率'
    })
  })

  it('falls back to average historical yield for fund-like assets', () => {
    const detail = createDetail({
      yearlyYields: [
        { year: 2022, yield: 0.028 },
        { year: 2023, yield: 0.031 },
        { year: 2024, yield: 0.025 }
      ]
    })

    expect(getAverageYield(detail)).toBeCloseTo(0.028, 6)
    const snapshot = getYieldSnapshot(detail)
    expect(snapshot.label).toBe('历史分配收益率')
    expect(snapshot.value).toBeCloseTo(0.028, 6)
  })

  it('returns no label when no yield data exists', () => {
    expect(getYieldSnapshot(createDetail({}))).toEqual({
      value: undefined,
      label: undefined
    })
  })
})
