import { beforeEach, describe, expect, it, vi } from 'vitest'

const { searchMock, getDetailMock, compareMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
  getDetailMock: vi.fn(),
  compareMock: vi.fn()
}))

vi.mock('@main/adapters', () => ({
  createPreciousMetalDataSource: () => ({
    search: searchMock,
    getDetail: getDetailMock,
    compare: compareMock
  }),
  createAShareDataSource: () => ({}),
  createFundCatalogDataSource: () => ({}),
  createFundDetailDataSource: () => ({}),
  createValuationDataSource: () => ({
    async getSnapshot() { return undefined },
    async getTrend() { return [] }
  })
}))

import { PreciousMetalAssetProvider } from '@main/repositories/assetProviderRegistry'
import type { AssetIdentifierDto } from '@shared/contracts/api'

const goldIdentifier: AssetIdentifierDto = { assetType: 'GOLD', market: 'SGE', code: 'AU9999' }
const silverIdentifier: AssetIdentifierDto = { assetType: 'SILVER', market: 'SGE', code: 'AG9999' }

describe('PreciousMetalAssetProvider', () => {
  beforeEach(() => {
    searchMock.mockReset()
    getDetailMock.mockReset()
    compareMock.mockReset()
  })

  it('declares the correct assetType and capabilities', () => {
    const gold = new PreciousMetalAssetProvider('GOLD')
    expect(gold.assetType).toBe('GOLD')
    const caps = gold.getCapabilities()
    expect(caps.hasIncomeAnalysis).toBe(false)
    expect(caps.hasValuationAnalysis).toBe(false)
    expect(caps.hasBacktest).toBe(true)
    expect(caps.hasComparisonMetrics).toBe(true)
  })

  it('supports only matching assetType on SGE market', () => {
    const gold = new PreciousMetalAssetProvider('GOLD')
    expect(gold.supports(goldIdentifier)).toBe(true)
    expect(gold.supports(silverIdentifier)).toBe(false)
    expect(gold.supports({ assetType: 'GOLD', market: 'A_SHARE', code: 'AU9999' })).toBe(false)
  })

  it('filters search results to its own assetType', async () => {
    searchMock.mockResolvedValueOnce([
      { assetType: 'GOLD', code: 'AU9999', name: '黄金99.99', market: 'SGE' },
      { assetType: 'SILVER', code: 'AG9999', name: '白银99.99', market: 'SGE' }
    ])

    const gold = new PreciousMetalAssetProvider('GOLD')
    const results = await gold.search('黄金')

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({ assetType: 'GOLD', market: 'SGE', code: 'AU9999', name: '黄金99.99' })
  })

  it('returns a precious metal detail source with kind tag', async () => {
    getDetailMock.mockResolvedValueOnce({
      assetType: 'GOLD',
      code: 'AU9999',
      name: '黄金99.99',
      market: 'SGE',
      purity: '99.99%',
      exchangeName: '上海黄金交易所',
      latestPrice: 920.5,
      priceHistory: [],
      dividendEvents: [],
      dataSource: 'eastmoney'
    })

    const gold = new PreciousMetalAssetProvider('GOLD')
    const detail = await gold.getDetail(goldIdentifier)

    expect(detail.kind).toBe('GOLD')
    expect(detail.identifier).toEqual(goldIdentifier)
    expect(detail.latestPrice).toBe(920.5)
    expect(detail.exchangeName).toBe('上海黄金交易所')
  })

  it('throws for unsupported identifier', async () => {
    const gold = new PreciousMetalAssetProvider('GOLD')
    await expect(gold.getDetail(silverIdentifier)).rejects.toThrow(/Unsupported precious metal/)
  })

  it('compare routes to data source compare with codes', async () => {
    compareMock.mockResolvedValueOnce([
      {
        assetType: 'GOLD',
        code: 'AU9999',
        name: '黄金99.99',
        market: 'SGE',
        purity: '99.99%',
        exchangeName: '上海黄金交易所',
        latestPrice: 920.5,
        priceHistory: [],
        dividendEvents: [],
        dataSource: 'eastmoney'
      }
    ])

    const gold = new PreciousMetalAssetProvider('GOLD')
    const results = await gold.compare([goldIdentifier])

    expect(compareMock).toHaveBeenCalledWith(['AU9999'], 'GOLD')
    expect(results).toHaveLength(1)
    expect(results[0].kind).toBe('GOLD')
  })
})
