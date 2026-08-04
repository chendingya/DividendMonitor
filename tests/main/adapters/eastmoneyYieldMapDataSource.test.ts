import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketQuoteRecord, MarketDividendRecord } from '@main/infrastructure/dataSources/types/sourceTypes'

vi.mock('@main/infrastructure/dataSources/gateway/sourceGateway', () => ({
  getDefaultSourceGateway: () => mockGateway
}))

const mockGateway = {
  request: vi.fn()
}

const { EastmoneyYieldMapDataSource } = await import(
  '@main/adapters/eastmoney/eastmoneyYieldMapDataSource'
)

describe('EastmoneyYieldMapDataSource', () => {
  beforeEach(() => {
    mockGateway.request.mockReset()
  })

  it('fetchAllQuotes 按 total/100 分页抓取并合并，单页失败跳过', async () => {
    mockGateway.request
      .mockResolvedValueOnce({ data: { records: [{ code: '600519', market: '1', name: '贵州茅台', price: 1450, industry: '白酒' }], total: 400 } })
      .mockResolvedValueOnce({ data: { records: [{ code: '000001', market: '0', name: '平安银行', price: 10, industry: '银行' }], total: 400 } })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ data: { records: [{ code: '000002', market: '0', name: '万科A', price: 8, industry: '地产' }], total: 400 } })

    const source = new EastmoneyYieldMapDataSource()
    const records = await source.fetchAllQuotes()
    expect(records).toHaveLength(3)
    expect(mockGateway.request).toHaveBeenCalledTimes(4)
    expect(mockGateway.request).toHaveBeenNthCalledWith(1, {
      capability: 'market.clist',
      input: { page: 1, pageSize: 100 },
      cacheKey: 'yield-map:clist:1',
      cacheTtlMs: 60 * 60 * 1000
    })
  })

  it('fetchAllQuotes 并发上限为 10', async () => {
    mockGateway.request.mockImplementation(async () => ({
      data: { records: [], total: 1000 }
    }))
    const source = new EastmoneyYieldMapDataSource()
    await source.fetchAllQuotes()
    expect(mockGateway.request).toHaveBeenCalledTimes(10)
  })

  it('fetchAllDividendEvents 分页抓取合并', async () => {
    mockGateway.request
      .mockResolvedValueOnce({ data: { records: [{ code: '600519', exDate: '2026-06-20', pretaxBonusRmb: 300 }], total: 600 } })
      .mockResolvedValueOnce({ data: { records: [{ code: '000001', exDate: '2026-05-01', pretaxBonusRmb: 20 }], total: 600 } })
      .mockResolvedValueOnce({ data: { records: [], total: 600 } })

    const source = new EastmoneyYieldMapDataSource()
    const records = await source.fetchAllDividendEvents()
    expect(records).toHaveLength(2)
    expect(mockGateway.request).toHaveBeenNthCalledWith(1, {
      capability: 'market.dividend',
      input: { page: 1, pageSize: 500 },
      cacheKey: 'yield-map:dividend:1',
      cacheTtlMs: 60 * 60 * 1000
    })
  })
})
