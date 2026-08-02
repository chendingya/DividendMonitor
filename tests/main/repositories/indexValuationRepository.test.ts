import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IndexValuationRepository } from '@main/repositories/indexValuationRepository'
import type { ValuationDataSource, ValuationSnapshotSource } from '@main/adapters/contracts'
import type { ValuationCacheRepository } from '@main/repositories/valuationCacheRepository'
import { resolveIndexCode } from '@main/repositories/indexCodeResolver'

vi.mock('@main/repositories/indexCodeResolver', () => ({
  resolveIndexCode: vi.fn()
}))

const SNAPSHOT: ValuationSnapshotSource = {
  currentValue: 12.5,
  currentPercentile: 0.35,
  status: '估值较低'
}

function createDataSourceMock() {
  return {
    getSnapshot: vi.fn(async () => SNAPSHOT),
    getTrend: vi.fn(async () => [{ date: '2026-01-01', value: 12.5 }])
  } as unknown as ValuationDataSource
}

function createDanjuanMock() {
  return {
    getIndexSnapshot: vi.fn()
  } as unknown as { getIndexSnapshot: ReturnType<typeof vi.fn> }
}

function createDiskCacheMock() {
  return {
    upsert: vi.fn(),
    findByKey: vi.fn(),
    findFreshByKey: vi.fn(() => undefined)
  } as unknown as ValuationCacheRepository
}

beforeEach(() => {
  vi.mocked(resolveIndexCode).mockReset()
  vi.mocked(resolveIndexCode).mockResolvedValue({
    code: '000015',
    name: '红利指数',
    market: 'SH'
  })
})

describe('IndexValuationRepository', () => {
  it('writes disk cache with index: prefix', async () => {
    const diskCache = createDiskCacheMock()
    const repo = new IndexValuationRepository(createDataSourceMock(), createDanjuanMock(), diskCache)

    const result = await repo.getIndexValuation('红利指数')

    expect(result).toBeTruthy()
    expect(result!.source).toBe('eastmoney')
    expect(diskCache.upsert).toHaveBeenCalledTimes(1)
    expect(diskCache.upsert).toHaveBeenCalledWith('index:000015', JSON.stringify(result))
  })

  it('reads disk cache with index: prefix', async () => {
    const diskCache = createDiskCacheMock()
    const repo = new IndexValuationRepository(createDataSourceMock(), createDanjuanMock(), diskCache)

    await repo.getIndexValuation('红利指数')

    expect(diskCache.findFreshByKey).toHaveBeenCalledWith('index:000015', 15 * 60 * 1000)
  })

  it('uses bare index code for in-memory cache key', async () => {
    const diskCache = createDiskCacheMock()
    const dataSource = createDataSourceMock()
    const repo = new IndexValuationRepository(dataSource, createDanjuanMock(), diskCache)

    await repo.getIndexValuation('红利指数')
    expect(dataSource.getSnapshot).toHaveBeenCalledTimes(2) // PE + PB

    // 第二次调用应命中内存缓存（裸 indexCode），不再请求数据源
    await repo.getIndexValuation('红利指数')
    expect(dataSource.getSnapshot).toHaveBeenCalledTimes(2)
  })

  it('falls back to danjuan when eastmoney fails', async () => {
    const dataSource = {
      getSnapshot: vi.fn(async () => undefined),
      getTrend: vi.fn(async () => [])
    } as unknown as ValuationDataSource
    const danjuan = createDanjuanMock()
    danjuan.getIndexSnapshot.mockResolvedValue({
      currentValue: 8.5,
      currentPercentile: 0.6,
      status: 'medium'
    })
    const diskCache = createDiskCacheMock()
    const repo = new IndexValuationRepository(dataSource, danjuan, diskCache)

    const result = await repo.getIndexValuation('红利指数')

    expect(result).toBeTruthy()
    expect(result!.source).toBe('danjuan')
    expect(diskCache.upsert).toHaveBeenCalledWith('index:000015', JSON.stringify(result))
  })

  it('does not write cache when both sources fail', async () => {
    const dataSource = {
      getSnapshot: vi.fn(async () => undefined),
      getTrend: vi.fn(async () => [])
    } as unknown as ValuationDataSource
    const danjuan = createDanjuanMock()
    danjuan.getIndexSnapshot.mockResolvedValue(undefined)
    const diskCache = createDiskCacheMock()
    const repo = new IndexValuationRepository(dataSource, danjuan, diskCache)

    const result = await repo.getIndexValuation('红利指数')

    expect(result).toBeUndefined()
    expect(diskCache.upsert).not.toHaveBeenCalled()
  })
})
