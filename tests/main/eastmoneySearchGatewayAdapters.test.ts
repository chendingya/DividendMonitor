import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn()
}))

vi.mock('@main/infrastructure/dataSources/gateway/sourceGateway', () => ({
  getDefaultSourceGateway: () => ({
    request: requestMock
  })
}))

import { EastmoneyAShareDataSource } from '@main/adapters/eastmoney/eastmoneyAShareDataSource'
import { EastmoneyFundCatalogAdapter } from '@main/adapters/eastmoney/eastmoneyFundCatalogAdapter'

describe('Eastmoney search adapters via SourceGateway', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  it('filters stock suggestions from shared asset search results', async () => {
    requestMock.mockResolvedValueOnce({
      data: [
        { Code: '600519', Name: '贵州茅台', SecurityTypeName: '沪A', Classify: 'AStock' },
        { Code: '510300', Name: '沪深300ETF', SecurityTypeName: '基金', Classify: 'Fund' }
      ],
      provider: 'eastmoney',
      endpointId: 'eastmoney.search.suggest',
      isFallback: false,
      isStale: false,
      fetchedAt: new Date().toISOString()
    })

    const result = await new EastmoneyAShareDataSource().search('300')

    expect(requestMock).toHaveBeenCalledWith({
      capability: 'asset.search',
      input: {
        keyword: '300',
        count: 10
      }
    })
    expect(result).toEqual([
      {
        symbol: '600519',
        name: '贵州茅台',
        market: 'A_SHARE'
      }
    ])
  })

  it('filters fund suggestions by requested asset type', async () => {
    requestMock.mockResolvedValueOnce({
      data: [
        { Code: '510880', Name: '红利ETF', SecurityTypeName: '场内基金', SecurityType: 'ETF', Classify: 'Fund' },
        { Code: '160222', Name: '食品饮料LOF', SecurityTypeName: '基金', SecurityType: 'LOF', Classify: 'Fund' }
      ],
      provider: 'eastmoney',
      endpointId: 'eastmoney.search.suggest',
      isFallback: false,
      isStale: false,
      fetchedAt: new Date().toISOString()
    })

    const result = await new EastmoneyFundCatalogAdapter().search('红利', 'ETF')

    expect(requestMock).toHaveBeenCalledWith({
      capability: 'asset.search',
      input: {
        keyword: '红利',
        count: 20
      }
    })
    expect(result).toEqual([
      {
        assetType: 'ETF',
        code: '510880',
        name: '红利ETF',
        market: 'A_SHARE'
      }
    ])
  })
})
