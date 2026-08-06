import { beforeEach, describe, expect, it, vi } from 'vitest'

type IndustryRow = {
  industry: string
  snapshot_date: string
  median_yield: number
  avg_yield: number
  stock_count: number
}

/** 可编程的 supabase 链式 mock：支持 select/order/limit/eq 的 await 链 */
function createSupabaseMock(allRows: IndustryRow[]) {
  const calls: string[] = []

  const mock = {
    from: vi.fn(() => {
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
              calls.push(`limit:${columns}`)
              const dates = [...new Set(allRows.map((row) => row.snapshot_date))].sort().reverse()
              resolve({ data: dates.slice(0, 1).map((date) => ({ snapshot_date: date })), error: null })
            }
          }
        },
        eq(column: string, value: unknown) {
          eqFilter = { column, value }
          return chain
        },
        then: (resolve: (value: { data: unknown; error: null }) => void) => {
          calls.push(`query:${columns}${eqFilter ? `:eq:${String(eqFilter.value)}` : ''}`)
          const rows = eqFilter
            ? allRows.filter((row) => row.snapshot_date === eqFilter!.value)
            : allRows
          resolve({ data: rows, error: null })
        }
      }
      return chain
    })
  }

  return { mock, calls }
}

const authMock = {
  getSession: vi.fn()
}

vi.mock('@main/infrastructure/supabase/supabaseClient', () => ({
  getSupabaseClient: () => (globalThis as Record<string, unknown>)['__supabaseMock__']
}))
vi.mock('@main/infrastructure/supabase/authService', () => ({
  authService: authMock
}))

const { SupabaseYieldMapRepository } = await import('@main/repositories/supabaseYieldMapRepository')

describe('SupabaseYieldMapRepository.getLatestIndustries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('无云端数据时返回 null 日期与空列表', async () => {
    const { mock } = createSupabaseMock([])
    ;(globalThis as Record<string, unknown>)['__supabaseMock__'] = mock

    const repo = new SupabaseYieldMapRepository()
    const result = await repo.getLatestIndustries()

    expect(result).toEqual({ snapshotDate: null, industries: [] })
  })

  it('只返回最新 snapshot_date 的全部行业并携带日期', async () => {
    const rows: IndustryRow[] = [
      { industry: '白酒', snapshot_date: '2026-08-05', median_yield: 0.03, avg_yield: 0.028, stock_count: 10 },
      { industry: '银行', snapshot_date: '2026-08-05', median_yield: 0.05, avg_yield: 0.052, stock_count: 42 },
      { industry: '白酒', snapshot_date: '2026-08-04', median_yield: 0.029, avg_yield: 0.027, stock_count: 10 }
    ]
    const { mock } = createSupabaseMock(rows)
    ;(globalThis as Record<string, unknown>)['__supabaseMock__'] = mock

    const repo = new SupabaseYieldMapRepository()
    const result = await repo.getLatestIndustries()

    expect(result.snapshotDate).toBe('2026-08-05')
    expect(result.industries).toHaveLength(2)
    expect(result.industries.map((item) => item.industry).sort()).toEqual(['白酒', '银行'])
    expect(result.industries[0]).toEqual({
      industry: '白酒',
      medianYield: 0.03,
      avgYield: 0.028,
      stockCount: 10
    })
  })

  it('先查最新日期再按日期查全量，避免 limit 截断', async () => {
    const rows: IndustryRow[] = Array.from({ length: 501 }, (_, index) => ({
      industry: `行业${index}`,
      snapshot_date: '2026-08-05',
      median_yield: 0.03,
      avg_yield: 0.03,
      stock_count: 1
    }))
    const { mock, calls } = createSupabaseMock(rows)
    ;(globalThis as Record<string, unknown>)['__supabaseMock__'] = mock

    const repo = new SupabaseYieldMapRepository()
    const result = await repo.getLatestIndustries()

    expect(result.industries).toHaveLength(501)
    expect(calls).toEqual([
      'limit:snapshot_date',
      'query:industry, snapshot_date, median_yield, avg_yield, stock_count:eq:2026-08-05'
    ])
  })

  it('云端读取失败时抛出错误', async () => {
    const mock = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              then: (resolve: (value: { data: null; error: { message: string } }) => void) => {
                resolve({ data: null, error: { message: '连接超时' } })
              }
            }))
          }))
        }))
      }))
    }
    ;(globalThis as Record<string, unknown>)['__supabaseMock__'] = mock

    const repo = new SupabaseYieldMapRepository()
    await expect(repo.getLatestIndustries()).rejects.toThrow('连接超时')
  })
})

describe('SupabaseYieldMapRepository.upsertIndustries', () => {
  it('空列表直接返回不查询', async () => {
    const { mock } = createSupabaseMock([])
    ;(globalThis as Record<string, unknown>)['__supabaseMock__'] = mock

    const repo = new SupabaseYieldMapRepository()
    await expect(repo.upsertIndustries([], '2026-08-05')).resolves.toBeUndefined()
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('未登录时上传失败并抛出错误', async () => {
    const { mock } = createSupabaseMock([])
    ;(globalThis as Record<string, unknown>)['__supabaseMock__'] = mock
    authMock.getSession.mockResolvedValue(null)

    const repo = new SupabaseYieldMapRepository()
    await expect(
      repo.upsertIndustries([{ industry: '白酒', medianYield: 0.03, avgYield: 0.028, stockCount: 10 }], '2026-08-05')
    ).rejects.toThrow('未登录')
  })
})
