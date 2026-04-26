import { describe, expect, it } from 'vitest'
import { toStockDetailDto } from '@main/application/mappers/stockDtoMappers'

describe('toStockDetailDto', () => {
  it('preserves valuation history for stock detail charts', () => {
    const dto = toStockDetailDto({
      stock: {
        symbol: '600519',
        name: '贵州茅台',
        market: 'A_SHARE',
        latestPrice: 1500,
        peRatio: 20,
        pbRatio: 6.5
      },
      dividendEvents: [],
      priceHistory: [],
      latestAnnualNetProfit: 100,
      latestTotalShares: 10,
      lastAnnualPayoutRatio: 0.5,
      lastYearTotalDividendAmount: 50,
      dataSource: 'eastmoney',
      valuation: {
        pe: {
          currentValue: 20,
          currentPercentile: 60,
          status: '估值中等',
          history: [
            { date: '2024-01-01', value: 18 },
            { date: '2025-01-01', value: 20 }
          ]
        },
        pb: {
          currentValue: 6.5,
          currentPercentile: 55,
          status: '估值中等',
          history: [
            { date: '2024-01-01', value: 6.1 },
            { date: '2025-01-01', value: 6.5 }
          ]
        }
      }
    })

    expect(dto.valuation?.pe?.history).toEqual([
      { date: '2024-01-01', value: 18 },
      { date: '2025-01-01', value: 20 }
    ])
    expect(dto.valuation?.pb?.history).toEqual([
      { date: '2024-01-01', value: 6.1 },
      { date: '2025-01-01', value: 6.5 }
    ])
  })
})
