import { describe, expect, it } from 'vitest'
import { resolveFundAssetType } from '@main/adapters/eastmoney/eastmoneyFundCatalogAdapter'

describe('resolveFundAssetType', () => {
  it('treats ETF keywords as ETF', () => {
    expect(
      resolveFundAssetType({
        Code: '510880',
        Name: '红利ETF',
        SecurityTypeName: '场内基金',
        SecurityType: 'Fund',
        Classify: 'Fund'
      })
    ).toBe('ETF')
  })

  it('uses code heuristic for ambiguous in-market fund descriptors', () => {
    expect(
      resolveFundAssetType({
        Code: '510300',
        Name: '沪深300',
        SecurityTypeName: '场内基金',
        SecurityType: 'Fund',
        Classify: 'Fund'
      })
    ).toBe('ETF')
  })

  it('keeps LOF-like funds as FUND', () => {
    expect(
      resolveFundAssetType({
        Code: '160222',
        Name: '食品饮料LOF',
        SecurityTypeName: '场内基金',
        SecurityType: 'Fund',
        Classify: 'Fund'
      })
    ).toBe('FUND')
  })

  it('treats ETF feeder funds as FUND not ETF', () => {
    expect(
      resolveFundAssetType({
        Code: '009051',
        Name: '易方达中证红利ETF联接发起式A',
        SecurityTypeName: '开放式基金',
        SecurityType: 'Fund',
        Classify: 'Fund'
      })
    ).toBe('FUND')
  })
})
