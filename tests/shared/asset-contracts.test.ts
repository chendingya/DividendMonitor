import { describe, expect, it } from 'vitest'
import {
  buildAssetKey,
  createAssetQuery,
  createStockAssetQuery,
  parseAssetKey,
  resolveAssetQuery
} from '@shared/contracts/api'

describe('asset contracts helpers', () => {
  it('builds and parses non-stock asset keys', () => {
    const assetKey = buildAssetKey('ETF', 'A_SHARE', '510300')

    expect(assetKey).toBe('ETF:A_SHARE:510300')
    expect(parseAssetKey(assetKey)).toEqual({
      assetType: 'ETF',
      market: 'A_SHARE',
      code: '510300'
    })
  })

  it('creates stock queries with symbol compatibility fields', () => {
    expect(createStockAssetQuery(' 600519 ')).toEqual({
      assetKey: 'STOCK:A_SHARE:600519',
      assetType: 'STOCK',
      market: 'A_SHARE',
      code: '600519',
      symbol: '600519'
    })
  })

  it('creates fund queries without stock-only symbol field', () => {
    expect(createAssetQuery('FUND', '160222')).toEqual({
      assetKey: 'FUND:A_SHARE:160222',
      assetType: 'FUND',
      market: 'A_SHARE',
      code: '160222',
      symbol: undefined
    })
  })

  it('resolves asset identity from assetKey first', () => {
    expect(resolveAssetQuery({ assetKey: 'ETF:A_SHARE:512880', symbol: '600519' })).toEqual({
      assetType: 'ETF',
      market: 'A_SHARE',
      code: '512880'
    })
  })

  it('rejects malformed asset keys', () => {
    expect(parseAssetKey('INVALID')).toBeNull()
    expect(() => resolveAssetQuery({ assetKey: 'UNKNOWN:A_SHARE:510300' })).toThrow('Invalid assetKey')
  })
})
