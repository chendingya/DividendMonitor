import { describe, expect, it, vi } from 'vitest'
import type { AssetProvider } from '@main/repositories/assetProviderRegistry'
import { AssetProviderRegistry, PreciousMetalAssetProvider } from '@main/repositories/assetProviderRegistry'
import { AssetRepository } from '@main/repositories/assetRepository'
import { toAssetSearchItemDto } from '@main/application/mappers/stockDtoMappers'
import { pickBestSearchResult } from '@renderer/components/dashboard/portfolioAssetIdentity'

function createProvider(assetType: 'STOCK' | 'ETF' | 'FUND' | 'GOLD' | 'SILVER', overrides: Partial<AssetProvider> = {}): AssetProvider {
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
      getSearchProviders(assetTypes?: Array<'STOCK' | 'ETF' | 'FUND' | 'GOLD' | 'SILVER'>) {
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

  it('keeps matching local precious metals when remote providers fail', async () => {
    const failedStockProvider = createProvider('STOCK', {
      async search() { throw new Error('stock search network unavailable') }
    })
    const failedFundProvider = createProvider('FUND', {
      async search() { throw new Error('fund search network unavailable') }
    })
    const repository = new AssetRepository(new AssetProviderRegistry([
      failedStockProvider,
      failedFundProvider,
      new PreciousMetalAssetProvider('GOLD'),
      new PreciousMetalAssetProvider('SILVER')
    ]))

    await expect(repository.search({ keyword: 'AU9999', assetTypes: ['STOCK', 'FUND', 'GOLD'] })).resolves.toEqual([
      { assetType: 'GOLD', market: 'SGE', code: 'AU9999', name: '黄金99.99', searchIncomplete: true }
    ])
  })

  it('does not treat the stock match as unique when the same-code fund search failed', async () => {
    const repository = new AssetRepository(new AssetProviderRegistry([
      createProvider('STOCK', {
        async search() {
          return [{ assetType: 'STOCK', market: 'A_SHARE', code: '000001', symbol: '000001', name: '平安银行' }]
        }
      }),
      createProvider('FUND', { async search() { throw new Error('fund catalog network unavailable') } })
    ]))

    const items = (await repository.search({ keyword: '000001' })).map(toAssetSearchItemDto)

    expect(items).toEqual([
      { assetKey: 'STOCK:A_SHARE:000001', assetType: 'STOCK', market: 'A_SHARE', code: '000001', symbol: '000001', name: '平安银行', searchIncomplete: true }
    ])
    expect(pickBestSearchResult('000001', items)).toBeUndefined()
  })

  it('keeps nonnumeric local metal identification available with incomplete search results', async () => {
    const repository = new AssetRepository(new AssetProviderRegistry([
      createProvider('FUND', { async search() { throw new Error('fund catalog network unavailable') } }),
      new PreciousMetalAssetProvider('GOLD')
    ]))

    const items = (await repository.search({ keyword: 'AU9999' })).map(toAssetSearchItemDto)

    expect(pickBestSearchResult('AU9999', items)).toEqual({
      assetKey: 'GOLD:SGE:AU9999', assetType: 'GOLD', market: 'SGE', code: 'AU9999', symbol: undefined, name: '黄金99.99', searchIncomplete: true
    })
  })

  it('preserves the source error when other providers have no matching results', async () => {
    const sourceError = new Error('stock search network unavailable')
    const repository = new AssetRepository(new AssetProviderRegistry([
      createProvider('STOCK', { async search() { throw sourceError } }),
      new PreciousMetalAssetProvider('GOLD'),
      new PreciousMetalAssetProvider('SILVER')
    ]))

    await expect(repository.search({ keyword: '贵州茅台' })).rejects.toBe(sourceError)
  })

  it('preserves the source error when all selected providers fail', async () => {
    const sourceError = new Error('ETF search network unavailable')
    const repository = new AssetRepository(new AssetProviderRegistry([
      createProvider('ETF', { async search() { throw sourceError } })
    ]))

    await expect(repository.search({ keyword: '红利', assetTypes: ['ETF'] })).rejects.toBe(sourceError)
  })

  it('returns an empty result when every selected provider succeeds without matches', async () => {
    const repository = new AssetRepository(new AssetProviderRegistry([
      createProvider('STOCK'),
      new PreciousMetalAssetProvider('GOLD'),
      new PreciousMetalAssetProvider('SILVER')
    ]))

    await expect(repository.search({ keyword: 'no-such-asset' })).resolves.toEqual([])
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
