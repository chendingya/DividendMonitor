import { describe, expect, it } from 'vitest'
import { buildCrossAssetComparison } from '@main/domain/services/crossAssetComparisonService'

describe('crossAssetComparisonService', () => {
  it('merges stock and housing sources into unified points', () => {
    const result = buildCrossAssetComparison({
      stocks: [
        {
          assetKey: 'STOCK:A_SHARE:600519',
          name: '贵州茅台',
          code: '600519',
          yieldPercent: 2.1,
          volatilityPercent: 28.4,
          industry: '白酒'
        }
      ],
      housing: [
        {
          city: '北京',
          yieldPercent: 2.08,
          volatilityPercent: 2.4,
          pricePerSqm: 47194
        }
      ]
    })

    expect(result.stockCount).toBe(1)
    expect(result.housingCount).toBe(1)
    expect(result.riskFreeRatePercent).toBe(2.5)
    expect(result.points).toHaveLength(2)

    const stock = result.points.find((point) => point.kind === 'stock')
    expect(stock).toMatchObject({
      id: 'STOCK:A_SHARE:600519',
      name: '贵州茅台',
      yieldPercent: 2.1,
      volatilityPercent: 28.4,
      yieldLabel: '估算股息率',
      detailPath: '/stock-detail?assetKey=STOCK%3AA_SHARE%3A600519'
    })

    const housing = result.points.find((point) => point.kind === 'housing')
    expect(housing).toMatchObject({
      id: '北京',
      city: '北京',
      yieldPercent: 2.08,
      volatilityPercent: 2.4,
      yieldLabel: '租金收益率',
      detailPath: '/housing/%E5%8C%97%E4%BA%AC'
    })
  })

  it('sorts points by yield descending and keeps missing yield last', () => {
    const result = buildCrossAssetComparison({
      stocks: [
        { assetKey: 'STOCK:A_SHARE:000001', name: '平安银行', yieldPercent: 4.8, volatilityPercent: 20 },
        { assetKey: 'STOCK:A_SHARE:600519', name: '贵州茅台', volatilityPercent: 28 }
      ],
      housing: [{ city: '上海', yieldPercent: 1.56, volatilityPercent: 3.1 }]
    })

    expect(result.points.map((point) => point.name)).toEqual(['平安银行', '上海', '贵州茅台'])
  })

  it('keeps points with missing dimensions so table can show them', () => {
    const result = buildCrossAssetComparison({
      stocks: [{ assetKey: 'STOCK:A_SHARE:000001', name: '平安银行' }],
      housing: []
    })

    expect(result.points).toHaveLength(1)
    expect(result.points[0].yieldPercent).toBeUndefined()
    expect(result.points[0].volatilityPercent).toBeUndefined()
  })

  it('accepts custom risk free rate and generatedAt', () => {
    const generatedAt = '2026-08-08T00:00:00.000Z'
    const result = buildCrossAssetComparison({
      stocks: [],
      housing: [],
      riskFreeRatePercent: 2.0,
      generatedAt
    })
    expect(result.riskFreeRatePercent).toBe(2.0)
    expect(result.generatedAt).toBe(generatedAt)
  })
})
