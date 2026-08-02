import { describe, expect, it, vi } from 'vitest'
import { ValuationRepository } from '@main/repositories/valuationRepository'
import type { ValuationDataSource, ValuationSnapshotSource } from '@main/adapters/contracts'
import type { ValuationCacheRepository } from '@main/repositories/valuationCacheRepository'
import type { StockValuationSource } from '@main/adapters/contracts'

const SNAPSHOT: ValuationSnapshotSource = {
  currentValue: 12.5,
  currentPercentile: 0.35,
  status: '估值较低'
}

function createDataSourceMock(getSnapshot?: ReturnType<typeof vi.fn>) {
  return {
    getSnapshot:
      getSnapshot ??
      vi.fn(async () => SNAPSHOT),
    getTrend: vi.fn(async () => [{ date: '2026-01-01', value: 12.5 }])
  } as unknown as ValuationDataSource
}

function createDiskCacheMock() {
  return {
    upsert: vi.fn(),
    findByKey: vi.fn(),
    findFreshByKey: vi.fn(() => undefined)
  } as unknown as ValuationCacheRepository
}

describe('ValuationRepository', () => {
  it('fetches valuation and writes memory + disk caches on first call', async () => {
    const dataSource = createDataSourceMock()
    const diskCache = createDiskCacheMock()
    const repo = new ValuationRepository(dataSource, diskCache)

    const valuation = await repo.getStockValuation('600519')

    expect(valuation).toBeTruthy()
    expect(valuation!.pe).toBeTruthy()
    expect(valuation!.pb).toBeTruthy()
    expect(diskCache.upsert).toHaveBeenCalledTimes(1)
    expect(diskCache.upsert).toHaveBeenCalledWith('600519', JSON.stringify(valuation))
  })

  it('returns cached valuation from memory without hitting data source', async () => {
    const dataSource = createDataSourceMock()
    const diskCache = createDiskCacheMock()
    const repo = new ValuationRepository(dataSource, diskCache)

    await repo.getStockValuation('600519')
    expect(dataSource.getSnapshot).toHaveBeenCalledTimes(2) // PE + PB

    await repo.getStockValuation('600519')
    expect(dataSource.getSnapshot).toHaveBeenCalledTimes(2) // 无新增请求
    expect(diskCache.findFreshByKey).toHaveBeenCalledTimes(1) // 仅首次磁盘探测，第二次内存命中不再查磁盘
  })

  it('restores from disk cache into memory when memory is empty', async () => {
    const dataSource = createDataSourceMock()
    const cached: StockValuationSource = {
      pe: { currentValue: 30.1, currentPercentile: 0.5, status: '估值中等', history: [] },
      pb: { currentValue: 8.2, currentPercentile: 0.6, status: '估值中等', history: [] }
    }
    const diskCache = createDiskCacheMock()
    diskCache.findFreshByKey = vi.fn(() => cached) as typeof diskCache.findFreshByKey

    const repo = new ValuationRepository(dataSource, diskCache)
    const valuation = await repo.getStockValuation('600519')

    expect(valuation).toEqual(cached)
    expect(dataSource.getSnapshot).not.toHaveBeenCalled()
  })

  it('does not write cache when valuation is empty', async () => {
    const dataSource = {
      getSnapshot: vi.fn(async () => undefined),
      getTrend: vi.fn(async () => [])
    } as unknown as ValuationDataSource
    const diskCache = createDiskCacheMock()
    const repo = new ValuationRepository(dataSource, diskCache)

    const valuation = await repo.getStockValuation('600519')

    expect(valuation).toBeUndefined()
    expect(diskCache.upsert).not.toHaveBeenCalled()
  })

  it('survives disk write failure and still returns valuation', async () => {
    const dataSource = createDataSourceMock()
    const diskCache = createDiskCacheMock()
    diskCache.upsert = vi.fn(() => {
      throw new Error('disk full')
    }) as typeof diskCache.upsert
    const repo = new ValuationRepository(dataSource, diskCache)

    const valuation = await repo.getStockValuation('600519')

    expect(valuation).toBeTruthy()
  })
})
