import { describe, expect, it } from 'vitest'
import {
  parseChineseAmountToNumber,
  parseFundBasicProfile,
  parseFundDividendEvents,
  resolveFundDisplayName
} from '@main/adapters/eastmoney/eastmoneyFundDetailDataSource'

describe('eastmoney fund detail parsers', () => {
  it('parses chinese amount units', () => {
    expect(parseChineseAmountToNumber('199.91亿')).toBe(19_991_000_000)
    expect(parseChineseAmountToNumber('5200万')).toBe(52_000_000)
    expect(parseChineseAmountToNumber('4.7820')).toBe(4.782)
    expect(parseChineseAmountToNumber(undefined)).toBeUndefined()
  })

  it('extracts basic fund profile fields from html', () => {
    const html = `
      <div>基金简称 沪深300ETF<</div>
      <div>基金类型 指数型-股票<</div>
      <div>基金管理人 华泰柏瑞基金<</div>
      <div>跟踪标的 沪深300指数<</div>
      <div>业绩比较基准 沪深300指数<</div>
      <div>单位净值 4.7842<</div>
      <div>净资产规模 199.91亿<</div>
    `

    expect(parseFundBasicProfile(html)).toEqual({
      name: '沪深300ETF',
      category: '指数型-股票',
      manager: '华泰柏瑞基金',
      trackingIndex: '沪深300指数',
      benchmark: '沪深300指数',
      latestNav: 4.7842,
      fundScale: 19_991_000_000
    })
  })

  it('extracts unit nav when label has parenthesized date', () => {
    const html = `
      <div>单位净值（04-27）：
      <b class="grn lar bold">
      1.2949 ( -0.19% )</b>
      </div>
      <div>净资产规模（截止至：2026年03月31日）<b>35.36亿</b></div>
    `

    expect(parseFundBasicProfile(html)).toEqual({
      name: undefined,
      category: undefined,
      manager: undefined,
      trackingIndex: undefined,
      benchmark: undefined,
      latestNav: 1.2949,
      fundScale: 3_536_000_000
    })
  })

  it('falls back to title when name field blocks are not directly parsable', () => {
    const html = `
      <html>
        <head>
          <title>红利ETF(510880)基金基本概况_基金档案_天天基金网</title>
        </head>
        <body>
          <dt>基金管理人</dt><dd>华泰柏瑞基金</dd>
        </body>
      </html>
    `

    expect(parseFundBasicProfile(html)).toEqual({
      name: '红利ETF',
      category: undefined,
      manager: '华泰柏瑞基金',
      trackingIndex: undefined,
      benchmark: undefined,
      latestNav: undefined,
      fundScale: undefined
    })
  })

  it('ignores blank names and falls back to quote or code', () => {
    expect(
      resolveFundDisplayName({
        basicProfileName: '   ',
        quoteName: '红利ETF',
        code: '510880'
      })
    ).toBe('红利ETF')

    expect(
      resolveFundDisplayName({
        basicProfileName: '',
        quoteName: '   ',
        code: '510880'
      })
    ).toBe('510880')
  })

  it('parses dividend rows and maps reference close prices', () => {
    const html = `
      <table>
        <tr>
          <td>2024年</td>
          <td>2024-07-12</td>
          <td>2024-07-15</td>
          <td>每份派现金0.012元</td>
          <td>2024-07-18</td>
        </tr>
        <tr>
          <td>2023年</td>
          <td>2023-12-08</td>
          <td>2023-12-11</td>
          <td>每份派现金0.015元</td>
          <td>2023-12-15</td>
        </tr>
      </table>
    `
    const priceHistory = [
      { date: '2023-12-08', close: 1.163 },
      { date: '2024-07-12', close: 1.764 }
    ]

    expect(parseFundDividendEvents(html, priceHistory)).toEqual([
      {
        year: 2023,
        recordDate: '2023-12-08',
        exDate: '2023-12-11',
        payDate: '2023-12-15',
        dividendPerShare: 0.015,
        referenceClosePrice: 1.163,
        source: 'eastmoney-fund'
      },
      {
        year: 2024,
        recordDate: '2024-07-12',
        exDate: '2024-07-15',
        payDate: '2024-07-18',
        dividendPerShare: 0.012,
        referenceClosePrice: 1.764,
        source: 'eastmoney-fund'
      }
    ])
  })

  it('falls back to fallbackPrice when priceHistory is empty for off-market funds', () => {
    const html = `
      <table>
        <tr>
          <td>2024年</td>
          <td>2024-07-12</td>
          <td>2024-07-15</td>
          <td>每份派现金0.012元</td>
          <td>2024-07-18</td>
        </tr>
      </table>
    `
    const priceHistory: { date: string; close: number }[] = []
    const fallbackPrice = 1.2345

    const events = parseFundDividendEvents(html, priceHistory, fallbackPrice)
    expect(events[0].referenceClosePrice).toBeCloseTo(fallbackPrice, 4)
  })
})
