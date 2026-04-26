import { describe, expect, it, vi } from 'vitest'

const { repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    getDetail: vi.fn(),
    compare: vi.fn()
  }
}))

vi.mock('@main/repositories/assetRepository', () => ({
  AssetRepository: class {
    getDetail = repositoryMock.getDetail
    compare = repositoryMock.compare
  }
}))

import { compareAssets } from '@main/application/useCases/compareAssets'
import { getAssetDetail } from '@main/application/useCases/getAssetDetail'

describe('asset use cases', () => {
  it('returns fund detail dto without forcing stock-only assertion', async () => {
    repositoryMock.getDetail.mockResolvedValueOnce({
      kind: 'FUND',
      identifier: {
        assetType: 'FUND',
        market: 'A_SHARE',
        code: '160222'
      },
      name: '国泰国证食品饮料行业指数',
      category: 'LOF-指数',
      manager: '国泰基金',
      trackingIndex: '国证食品饮料行业指数',
      benchmark: '国证食品饮料行业指数收益率',
      latestPrice: 1.832,
      latestNav: 1.836,
      fundScale: 5200000000,
      priceHistory: [],
      dividendEvents: [],
      dataSource: 'eastmoney'
    })

    await expect(getAssetDetail({ assetKey: 'FUND:A_SHARE:160222' })).resolves.toEqual(
      expect.objectContaining({
        assetType: 'FUND',
        assetKey: 'FUND:A_SHARE:160222',
        code: '160222',
        name: '国泰国证食品饮料行业指数'
      })
    )
  })

  it('maps mixed stock and fund compare rows', async () => {
    repositoryMock.compare.mockResolvedValueOnce([
      {
        kind: 'ETF',
        identifier: {
          assetType: 'ETF',
          market: 'A_SHARE',
          code: '510880'
        },
        name: '红利ETF',
        latestPrice: 1.234,
        fundScale: 1000000000,
        priceHistory: [],
        dividendEvents: [],
        dataSource: 'eastmoney'
      },
      {
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
          industry: '白酒',
          latestPrice: 1688,
          marketCap: 2120000000000,
          peRatio: 24.6,
          pbRatio: 8.3,
          totalShares: 1256197800
        },
        latestTotalShares: 1256197800,
        latestAnnualNetProfit: 86228000000,
        lastAnnualPayoutRatio: 0.56,
        lastYearTotalDividendAmount: 38782000000,
        priceHistory: [],
        dividendEvents: [],
        dataSource: 'eastmoney',
        valuation: undefined
      }
    ])

    await expect(
      compareAssets({
        items: [{ assetKey: 'ETF:A_SHARE:510880' }, { assetKey: 'STOCK:A_SHARE:600519' }]
      })
    ).resolves.toEqual([
      expect.objectContaining({
        assetType: 'ETF',
        assetKey: 'ETF:A_SHARE:510880',
        code: '510880'
      }),
      expect.objectContaining({
        assetType: 'STOCK',
        assetKey: 'STOCK:A_SHARE:600519',
        code: '600519',
        symbol: '600519'
      })
    ])
  })
})
