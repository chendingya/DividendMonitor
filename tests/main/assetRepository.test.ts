import { describe, expect, it, vi } from 'vitest'
import type { AssetProvider } from '@main/repositories/assetProviderRegistry'
import { AssetRepository } from '@main/repositories/assetRepository'

function createProvider(assetType: 'STOCK' | 'ETF' | 'FUND', overrides: Partial<AssetProvider> = {}): AssetProvider {
  return {
    assetType,
    supports(identifier) {
      return identifier.assetType === assetType
    },
    async search() {
      return []
    },
    async getDetail(identifier) {
      return {
        kind: assetType,
        identifier,
        assetType,
        market: identifier.market,
        code: identifier.code,
        name: `${assetType}-${identifier.code}`,
        latestPrice: 1,
        dividendEvents: [],
        dataSource: 'mock'
      } as never
    },
    ...overrides
  }
}

describe('AssetRepository', () => {
  it('filters search providers by requested asset types', async () => {
    const stockSearch = vi.fn(async () => [{ assetType: 'STOCK' as const, market: 'A_SHARE' as const, code: '600519', symbol: '600519', name: '贵州茅台' }])
    const etfSearch = vi.fn(async () => [{ assetType: 'ETF' as const, market: 'A_SHARE' as const, code: '510300', name: '沪深300ETF' }])
    const fundSearch = vi.fn(async () => [{ assetType: 'FUND' as const, market: 'A_SHARE' as const, code: '160222', name: '食品饮料LOF' }])

    const stockProvider = createProvider('STOCK', { search: stockSearch })
    const etfProvider = createProvider('ETF', { search: etfSearch })
    const fundProvider = createProvider('FUND', { search: fundSearch })
    const registry = {
      getProvider(identifier) {
        return [stockProvider, etfProvider, fundProvider].find((item) => item.supports(identifier))!
      },
      getSearchProviders(assetTypes?: Array<'STOCK' | 'ETF' | 'FUND'>) {
        const providers = [stockProvider, etfProvider, fundProvider]
        return assetTypes?.length ? providers.filter((item) => assetTypes.includes(item.assetType)) : providers
      }
    }

    const repository = new AssetRepository(registry as never)
    const result = await repository.search({
      keyword: '300',
      assetTypes: ['ETF', 'FUND']
    })

    expect(result.map((item) => item.assetType)).toEqual(['ETF', 'FUND'])
    expect(stockSearch).not.toHaveBeenCalled()
    expect(etfSearch).toHaveBeenCalledWith('300')
    expect(fundSearch).toHaveBeenCalledWith('300')
  })

  it('groups compare requests by provider and preserves original order', async () => {
    const stockCompare = vi.fn(async (identifiers) =>
      identifiers.map((identifier) => ({
        kind: 'STOCK' as const,
        identifier,
        stock: {
          symbol: identifier.code,
          name: `stock-${identifier.code}`,
          market: 'A_SHARE' as const,
          industry: 'bank',
          latestPrice: 10,
          marketCap: 100,
          peRatio: 5,
          pbRatio: 1,
          totalShares: 100
        },
        latestTotalShares: 100,
        latestAnnualNetProfit: 100,
        lastAnnualPayoutRatio: 0.5,
        lastYearTotalDividendAmount: 50,
        dividendEvents: [],
        dataSource: 'mock' as const,
        valuation: undefined
      }))
    )
    const fundGetDetail = vi.fn(async (identifier) => ({
      kind: 'ETF' as const,
      identifier,
      assetType: 'ETF' as const,
      market: 'A_SHARE' as const,
      code: identifier.code,
      name: `etf-${identifier.code}`,
      latestPrice: 3,
      dividendEvents: [],
      dataSource: 'mock' as const
    }))

    const stockProvider = createProvider('STOCK', { compare: stockCompare })
    const etfProvider = createProvider('ETF', { getDetail: fundGetDetail as AssetProvider['getDetail'] })
    const registry = {
      getProvider(identifier) {
        return identifier.assetType === 'STOCK' ? stockProvider : etfProvider
      },
      getSearchProviders() {
        return [stockProvider, etfProvider]
      }
    }

    const repository = new AssetRepository(registry as never)
    const result = await repository.compare({
      items: [{ assetKey: 'ETF:A_SHARE:510300' }, { assetKey: 'STOCK:A_SHARE:600519' }, { assetKey: 'STOCK:A_SHARE:000651' }]
    })

    expect(stockCompare).toHaveBeenCalledTimes(1)
    expect(stockCompare).toHaveBeenCalledWith([
      { assetType: 'STOCK', market: 'A_SHARE', code: '600519' },
      { assetType: 'STOCK', market: 'A_SHARE', code: '000651' }
    ])
    expect(fundGetDetail).toHaveBeenCalledTimes(1)
    expect(result.map((item) => `${item.identifier.assetType}:${item.identifier.code}`)).toEqual([
      'ETF:510300',
      'STOCK:600519',
      'STOCK:000651'
    ])
  })
})
