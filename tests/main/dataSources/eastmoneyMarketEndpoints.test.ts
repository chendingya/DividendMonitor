import { describe, expect, it } from 'vitest'
import {
  eastmoneyMarketClistEndpoint,
  eastmoneyMarketDividendEndpoint
} from '@main/infrastructure/dataSources/registry/eastmoneyEndpoints'

describe('eastmoneyMarketClistEndpoint', () => {
  it('buildUrl 分页参数正确且带行业字段', () => {
    const url = eastmoneyMarketClistEndpoint.buildUrl({ page: 3, pageSize: 100 })
    expect(url).toContain('pn=3')
    expect(url).toContain('pz=100')
    expect(url).toContain('fields=f12,f13,f14,f2,f100')
  })

  it('mapResponse 映射代码/名称/价格/行业并透传 total', () => {
    const raw = {
      data: {
        total: 5888,
        diff: [
          { f12: '600519', f13: 1, f14: '贵州茅台', f2: 1450.0, f100: '白酒' },
          { f12: '920258', f13: 0, f14: '新股', f2: '-', f100: null }
        ]
      }
    }
    const result = eastmoneyMarketClistEndpoint.mapResponse(raw as never, { page: 1 })
    expect(result.total).toBe(5888)
    expect(result.records).toHaveLength(2)
    expect(result.records[0]).toEqual({
      code: '600519',
      market: '1',
      name: '贵州茅台',
      price: 1450,
      industry: '白酒'
    })
    expect(result.records[1].price).toBeUndefined()
    expect(result.records[1].industry).toBeUndefined()
  })
})

describe('eastmoneyMarketDividendEndpoint', () => {
  it('buildUrl 分页参数正确', () => {
    const url = eastmoneyMarketDividendEndpoint.buildUrl({ page: 2, pageSize: 500 })
    expect(url).toContain('pageNumber=2')
    expect(url).toContain('pageSize=500')
    expect(url).toContain('reportName=RPT_SHAREBONUS_DET')
  })

  it('mapResponse 映射分红事件并透传 total', () => {
    const raw = {
      result: {
        count: 56378,
        data: [
          {
            SECURITY_CODE: '600519',
            SECURITY_NAME_ABBR: '贵州茅台',
            EX_DIVIDEND_DATE: '2026-06-20 00:00:00',
            PRETAX_BONUS_RMB: 300,
            ASSIGN_PROGRESS: '实施'
          }
        ]
      }
    }
    const result = eastmoneyMarketDividendEndpoint.mapResponse(raw as never, { page: 1 })
    expect(result.total).toBe(56378)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toEqual({
      code: '600519',
      name: '贵州茅台',
      exDate: '2026-06-20',
      pretaxBonusRmb: 300,
      assignProgress: '实施'
    })
  })

  it('mapResponse 对空数据返回空数组', () => {
    const result = eastmoneyMarketDividendEndpoint.mapResponse({ result: null } as never, { page: 1 })
    expect(result.records).toEqual([])
    expect(result.total).toBe(0)
  })
})
