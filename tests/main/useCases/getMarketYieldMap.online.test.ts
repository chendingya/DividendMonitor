import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { YieldMapStockEntry } from '@main/domain/services/yieldMapService'
import { SupabaseYieldMapRepository } from '@main/repositories/supabaseYieldMapRepository'

const stubs = vi.hoisted(() => {
  const mockRepo = {
    replaceAll: vi.fn(),
    getAll: vi.fn(),
    getFetchedAt: vi.fn()
  }

  const mockSource = {
    fetchAllQuotes: vi.fn(),
    fetchAllDividendEvents: vi.fn()
  }

  const authMock = {
    getSession: vi.fn()
  }

  return { mockRepo, mockSource, authMock, cloudRepo: { value: null as unknown } }
})

const { mockRepo, mockSource, authMock, cloudRepo } = stubs

/** 支持 select/order/limit/eq 链与 upsert 的 supabase mock */
function createSupabaseMock(cloudRows: Array<Record<string, unknown>>) {
  const upsertMock = vi.fn()
  const fromMock = vi.fn(() => {
    let columns = ''
    let eqFilter: { column: string; value: unknown } | null = null
    const chain = {
      select(cols: string) {
        columns = cols
        return chain
      },
      order() {
        return chain
      },
      limit() {
        return {
          then: (resolve: (value: { data: unknown; error: null }) => void) => {
            const dates = [...new Set(cloudRows.map((row) => String(row.snapshot_date)))].sort().reverse()
            resolve({ data: dates.slice(0, 1).map((date) => ({ snapshot_date: date })), error: null })
          }
        }
      },
      eq(column: string, value: unknown) {
        eqFilter = { column, value }
        return chain
      },
      then: (resolve: (value: { data: unknown; error: null }) => void) => {
        const rows = eqFilter
          ? cloudRows.filter((row) => String(row.snapshot_date) === eqFilter!.value)
          : cloudRows
        resolve({ data: rows, error: null })
      },
      upsert: upsertMock
    }
    return chain
  })
  return { mock: { from: fromMock }, upsertMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  cloudRepo.value = null
  authMock.getSession.mockResolvedValue({ user: { id: 'user-1' } })
})

vi.mock('@main/repositories/yieldMapRepository', () => ({
  YieldMapRepository: class {
    replaceAll = mockRepo.replaceAll
    getAll = mockRepo.getAll
    getFetchedAt = mockRepo.getFetchedAt
  }
}))
vi.mock('@main/adapters/eastmoney/eastmoneyYieldMapDataSource', () => ({
  EastmoneyYieldMapDataSource: class {
    fetchAllQuotes = mockSource.fetchAllQuotes
    fetchAllDividendEvents = mockSource.fetchAllDividendEvents
  }
}))
vi.mock('@main/infrastructure/supabase/supabaseClient', () => ({
  getSupabaseClient: () => (globalThis as Record<string, unknown>)['__supabaseMock__']
}))
vi.mock('@main/infrastructure/supabase/authService', () => ({
  authService: stubs.authMock
}))
vi.mock('@main/repositories/repositoryFactory', () => ({
  getYieldMapRepository: () => stubs.cloudRepo.value
}))

const { getMarketYieldMap, refreshMarketYieldMap } = await import(
  '@main/application/useCases/getMarketYieldMap'
)

const STALE_TS = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

describe('getMarketYieldMap 在线兜底', () => {
  it('本地快照过期且云端有行业快照时，返回 partial 结果并携带云端快照日期', async () => {
    mockRepo.getFetchedAt.mockReturnValue(STALE_TS)
    mockRepo.getAll.mockReturnValue([])
    cloudRepo.value = new SupabaseYieldMapRepository()
    const { mock } = createSupabaseMock([
      { industry: '白酒', snapshot_date: '2026-08-05', median_yield: 0.03, avg_yield: 0.028, stock_count: 10 }
    ])
    ;(globalThis as Record<string, unknown>)['__supabaseMock__'] = mock

    const result = await getMarketYieldMap()

    expect(result.partial).toBe(true)
    expect(result.stockCount).toBe(0)
    expect(result.stocks).toEqual([])
    expect(result.industries).toHaveLength(1)
    expect(result.fetchedAt).toBe('2026-08-05')
    expect(mockSource.fetchAllQuotes).not.toHaveBeenCalled()
  })

  it('云端无行业快照时回退本地全量抓取', async () => {
    mockRepo.getFetchedAt.mockReturnValue(STALE_TS)
    mockRepo.getAll.mockReturnValue([])
    cloudRepo.value = new SupabaseYieldMapRepository()
    const { mock } = createSupabaseMock([])
    ;(globalThis as Record<string, unknown>)['__supabaseMock__'] = mock
    mockSource.fetchAllQuotes.mockResolvedValue([
      { code: '600519', market: '1', name: '贵州茅台', price: 1450, industry: '白酒' }
    ])
    mockSource.fetchAllDividendEvents.mockResolvedValue([
      { code: '600519', exDate: '2026-06-20', pretaxBonusRmb: 300 }
    ])

    const result = await getMarketYieldMap()

    expect(result.stockCount).toBe(1)
    expect(mockSource.fetchAllQuotes).toHaveBeenCalledTimes(1)
  })
})

describe('refreshMarketYieldMap 云端上传', () => {
  it('上传云端快照不阻塞刷新结果返回', async () => {
    cloudRepo.value = new SupabaseYieldMapRepository()
    const { mock, upsertMock } = createSupabaseMock([])
    ;(globalThis as Record<string, unknown>)['__supabaseMock__'] = mock
    upsertMock.mockReturnValue(new Promise(() => {}))
    mockSource.fetchAllQuotes.mockResolvedValue([
      { code: '600519', market: '1', name: '贵州茅台', price: 1450, industry: '白酒' }
    ])
    mockSource.fetchAllDividendEvents.mockResolvedValue([
      { code: '600519', exDate: '2026-06-20', pretaxBonusRmb: 300 }
    ])
    mockRepo.getFetchedAt.mockReturnValue(new Date().toISOString())

    const refreshPromise = refreshMarketYieldMap()
    const result = await Promise.race([
      refreshPromise,
      new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 200))
    ])

    expect(result).not.toBe('TIMEOUT')
    expect(upsertMock).toHaveBeenCalled()
  })
})
