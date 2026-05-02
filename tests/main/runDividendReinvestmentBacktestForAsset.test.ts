import { beforeEach, describe, expect, it, vi } from 'vitest'

const { repositoryMock, backtestMock, gatewayRequestMock } = vi.hoisted(() => ({
  repositoryMock: {
    getDetail: vi.fn()
  },
  backtestMock: vi.fn(),
  gatewayRequestMock: vi.fn()
}))

vi.mock('@main/repositories/assetRepository', () => ({
  AssetRepository: class {
    getDetail = repositoryMock.getDetail
  }
}))

vi.mock('@main/domain/services/dividendReinvestmentBacktestService', () => ({
  runDividendReinvestmentBacktest: backtestMock
}))

vi.mock('@main/infrastructure/dataSources/gateway/sourceGateway', () => ({
  getDefaultSourceGateway: () => ({
    request: gatewayRequestMock
  })
}))

import { runDividendReinvestmentBacktestForAsset } from '@main/application/useCases/runDividendReinvestmentBacktestForAsset'

describe('runDividendReinvestmentBacktestForAsset', () => {
  beforeEach(() => {
    repositoryMock.getDetail.mockReset()
    backtestMock.mockReset()
    gatewayRequestMock.mockReset()
  })

  it('loads benchmark price history through SourceGateway', async () => {
    repositoryMock.getDetail.mockResolvedValueOnce({
      kind: 'STOCK',
      identifier: {
        assetType: 'STOCK',
        market: 'A_SHARE',
        code: '600519'
      },
      stock: {
        symbol: '600519',
        name: '贵州茅台',
        market: 'A_SHARE',
        latestPrice: 100
      },
      dividendEvents: [],
      priceHistory: [
        { date: '2024-01-02', close: 100 },
        { date: '2024-01-10', close: 110 }
      ],
      latestAnnualNetProfit: 0,
      latestTotalShares: 0,
      lastAnnualPayoutRatio: 0,
      lastYearTotalDividendAmount: 0,
      dataSource: 'eastmoney'
    })

    gatewayRequestMock.mockResolvedValueOnce({
      data: [
        { date: '2024-01-02', close: 100 },
        { date: '2024-01-10', close: 105 }
      ],
      provider: 'tencent',
      endpointId: 'tencent.kline.index',
      isFallback: false,
      isStale: false,
      fetchedAt: new Date().toISOString()
    })

    backtestMock.mockReturnValueOnce({
      buyDate: '2024-01-02',
      finalDate: '2024-01-10',
      initialCapital: 10000,
      finalValue: 11000,
      totalDividendIncome: 0,
      totalShares: 100,
      cashBalance: 0,
      totalReturn: 0.1,
      annualizedReturn: 0.1,
      transactions: [{ date: '2024-01-10' }],
      timeline: [],
      benchmarkSymbol: '1.000300'
    })

    const result = await runDividendReinvestmentBacktestForAsset({
      asset: { assetKey: 'STOCK:A_SHARE:600519' },
      buyDate: '2024-01-02',
      initialCapital: 10000,
      includeFees: false,
      feeRate: 0,
      stampDutyRate: 0,
      minCommission: 0,
      benchmarkSymbol: '1.000300'
    })

    expect(gatewayRequestMock).toHaveBeenCalledWith({
      capability: 'benchmark.kline',
      input: { benchmarkSymbol: '1.000300' }
    })
    expect(backtestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        benchmarkPriceHistory: [
          { date: '2024-01-02', close: 100 },
          { date: '2024-01-10', close: 105 }
        ],
        benchmarkSymbol: '1.000300'
      })
    )
    expect(result.benchmarkTimeline).toHaveLength(2)
    expect(result.benchmarkTimeline?.[0]).toEqual({ date: '2024-01-02', cumulativeReturn: 0 })
    expect(result.benchmarkTimeline?.[1]?.date).toBe('2024-01-10')
    expect(result.benchmarkTimeline?.[1]?.cumulativeReturn).toBeCloseTo(0.05)
  })
})
