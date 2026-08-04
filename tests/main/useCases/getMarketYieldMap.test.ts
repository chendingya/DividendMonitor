import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { YieldMapStockEntry } from '@main/domain/services/yieldMapService'

const mockRepo = {
  replaceAll: vi.fn(),
  getAll: vi.fn(),
  getFetchedAt: vi.fn()
}

const mockSource = {
  fetchAllQuotes: vi.fn(),
  fetchAllDividendEvents: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
})

vi.mock('@main/repositories/yieldMapRepository', () => ({ YieldMapRepository: class { replaceAll = mockRepo.replaceAll; getAll = mockRepo.getAll; getFetchedAt = mockRepo.getFetchedAt } }))
vi.mock('@main/adapters/eastmoney/eastmoneyYieldMapDataSource', () => ({ EastmoneyYieldMapDataSource: class { fetchAllQuotes = mockSource.fetchAllQuotes; fetchAllDividendEvents = mockSource.fetchAllDividendEvents } }))

const { getMarketYieldMap, refreshMarketYieldMap } = await import('@main/application/useCases/getMarketYieldMap')

const STALE_TS = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

describe('getMarketYieldMap', () => {
  it('缓存 24h 内直接读库不抓取', async () => {
    mockRepo.getFetchedAt.mockReturnValue(new Date().toISOString())
    mockRepo.getAll.mockReturnValue([
      { assetKey: 'STOCK:A_SHARE:600519', symbol: '600519', name: '贵州茅台', industry: '白酒', price: 1450, yieldTtm: 0.0207 }
    ] as YieldMapStockEntry[])
    const result = await getMarketYieldMap()
    expect(result.stockCount).toBe(1)
    expect(mockSource.fetchAllQuotes).not.toHaveBeenCalled()
  })

  it('缓存过期时抓取聚合入库', async () => {
    mockRepo.getFetchedAt.mockReturnValue(STALE_TS)
    mockRepo.getAll.mockReturnValue([])
    mockSource.fetchAllQuotes.mockResolvedValue([
      { code: '600519', market: '1', name: '贵州茅台', price: 1450, industry: '白酒' }
    ])
    mockSource.fetchAllDividendEvents.mockResolvedValue([
      { code: '600519', exDate: '2026-06-20', pretaxBonusRmb: 300 }
    ])
    const result = await getMarketYieldMap()
    expect(result.stockCount).toBe(1)
    expect(result.stocks[0].yieldTtm).toBeCloseTo(30 / 1450, 6)
    expect(result.industries[0].industry).toBe('白酒')
    expect(mockRepo.replaceAll).toHaveBeenCalledTimes(1)
    expect(result.fetchedAt).toBeTruthy()
  })

  it('refresh 强制抓取', async () => {
    mockSource.fetchAllQuotes.mockResolvedValue([])
    mockSource.fetchAllDividendEvents.mockResolvedValue([])
    const result = await refreshMarketYieldMap()
    expect(mockSource.fetchAllQuotes).toHaveBeenCalledTimes(1)
    expect(result.stockCount).toBe(0)
  })
})
