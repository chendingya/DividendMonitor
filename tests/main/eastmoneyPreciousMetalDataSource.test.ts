import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn()
}))

vi.mock('@main/infrastructure/dataSources/gateway/sourceGateway', () => ({
  getDefaultSourceGateway: () => ({
    request: requestMock
  })
}))

import { EastmoneyPreciousMetalDataSource } from '@main/adapters/eastmoney/eastmoneyPreciousMetalDataSource'

describe('EastmoneyPreciousMetalDataSource', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  it('matches gold by keyword "黄金"', async () => {
    const results = await new EastmoneyPreciousMetalDataSource().search('黄金')
    const codes = results.map((r) => r.code)
    expect(codes).toContain('AU9999')
    expect(codes).toContain('AU9995')
    expect(results.every((r) => r.assetType === 'GOLD' && r.market === 'SGE')).toBe(true)
  })

  it('matches silver by keyword "白银"', async () => {
    const results = await new EastmoneyPreciousMetalDataSource().search('白银')
    expect(results.map((r) => r.code)).toEqual(['AG9999'])
    expect(results[0].assetType).toBe('SILVER')
  })

  it('matches by contract code AU9999', async () => {
    const results = await new EastmoneyPreciousMetalDataSource().search('AU9999')
    expect(results.map((r) => r.code)).toContain('AU9999')
  })

  it('returns empty for unrelated keyword', async () => {
    const results = await new EastmoneyPreciousMetalDataSource().search('股票')
    expect(results).toEqual([])
  })

  it('fetches detail with quote and kline', async () => {
    requestMock
      .mockResolvedValueOnce({
        data: { f43: 920.5, f57: 'AU9999', f58: '黄金9999' },
        provider: 'sina',
        endpointId: 'sina.precious.quote',
        isFallback: false,
        isStale: false,
        fetchedAt: new Date().toISOString()
      })
      .mockResolvedValueOnce({
        data: { f43: 4155.44, f57: 'hf_XAU' },
        provider: 'sina',
        endpointId: 'sina.international.precious.quote',
        isFallback: false,
        isStale: false,
        fetchedAt: new Date().toISOString()
      })
      .mockResolvedValueOnce({
        data: [{ date: '2026-06-18', close: 920.5 }, { date: '2026-06-19', close: 925 }],
        provider: 'eastmoney',
        endpointId: 'eastmoney.precious.kline',
        isFallback: false,
        isStale: false,
        fetchedAt: new Date().toISOString()
      })

    const detail = await new EastmoneyPreciousMetalDataSource().getDetail('AU9999', 'GOLD')

    expect(detail.code).toBe('AU9999')
    expect(detail.assetType).toBe('GOLD')
    expect(detail.market).toBe('SGE')
    expect(detail.latestPrice).toBe(920.5)
    expect(detail.internationalPriceUsdPerOz).toBe(4155.44)
    expect(detail.priceHistory).toHaveLength(2)
    expect(detail.dividendEvents).toEqual([])
    expect(detail.exchangeName).toBe('上海黄金交易所')
    expect(detail.purity).toBe('99.99%')
    expect(detail.dataSource).toBe('eastmoney')
  })

  it('throws for unknown contract code', async () => {
    await expect(new EastmoneyPreciousMetalDataSource().getDetail('UNKNOWN', 'GOLD')).rejects.toThrow(
      /Unknown precious metal contract/
    )
  })

  it('throws when quote returns no price', async () => {
    requestMock
      .mockResolvedValueOnce({
        data: { f43: undefined, f57: 'AU9999', f58: '黄金9999' },
        provider: 'sina',
        endpointId: 'sina.precious.quote',
        isFallback: false,
        isStale: false,
        fetchedAt: new Date().toISOString()
      })
      .mockResolvedValueOnce({
        data: { f43: 4155.44, f57: 'hf_XAU' },
        provider: 'sina',
        endpointId: 'sina.international.precious.quote',
        isFallback: false,
        isStale: false,
        fetchedAt: new Date().toISOString()
      })
      .mockResolvedValueOnce({
        data: [],
        provider: 'eastmoney',
        endpointId: 'eastmoney.precious.kline',
        isFallback: false,
        isStale: false,
        fetchedAt: new Date().toISOString()
      })

    await expect(new EastmoneyPreciousMetalDataSource().getDetail('AU9999', 'GOLD')).rejects.toThrow(
      /No quote data/
    )
  })
})
