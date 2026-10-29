import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNodeSqliteDatabase } from '@main/infrastructure/db/nodeSqliteDatabase'
import { initializeSchema, resetDatabaseResolver, setDatabaseResolver } from '@main/infrastructure/db/sqlite'
import type { SqliteDatabase } from '@main/infrastructure/db/databaseTypes'
import { setRuntimeMode } from '@main/infrastructure/supabase/runtimeMode'
import { WatchlistRepository } from '@main/repositories/watchlistRepository'
import { WatchlistGroupRepository } from '@main/repositories/watchlistGroupRepository'
import { StockAssetProvider, type StockAssetDetailSource } from '@main/repositories/assetProviderRegistry'
import { addWatchlistAsset } from '@main/application/useCases/addWatchlistAsset'
import { listWatchlist } from '@main/application/useCases/listWatchlist'
import { listWatchlistGroupAssets } from '@main/application/useCases/listWatchlistGroupAssets'
import { AssetSnapshotRepository } from '@main/repositories/assetSnapshotRepository'

let db: SqliteDatabase
const bankKey = 'STOCK:A_SHARE:601398'
const cachedAt = '2020-01-02T03:04:05.000Z'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function bankDetail(): StockAssetDetailSource {
  return {
    kind: 'STOCK',
    identifier: { assetType: 'STOCK', market: 'A_SHARE', code: '601398' },
    stock: { symbol: '601398', market: 'A_SHARE', name: '工商银行', latestPrice: 7.36 },
    dividendEvents: [],
    priceHistory: [],
    dataSource: 'eastmoney'
  } as StockAssetDetailSource
}

beforeEach(async () => {
  db = createNodeSqliteDatabase(new DatabaseSync(':memory:'))
  await initializeSchema(db)
  setDatabaseResolver(() => db)
  setRuntimeMode('offline')
  vi.spyOn(StockAssetProvider.prototype, 'getDetail').mockRejectedValue(new Error('market data unavailable'))
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetDatabaseResolver()
  await db.close()
})

async function saveBank() {
  await new WatchlistRepository().addAsset({ assetType: 'STOCK', market: 'A_SHARE', code: '601398', name: '工商银行' })
}

async function saveOldSnapshot(data = JSON.stringify(bankDetail())) {
  await db.prepare('INSERT INTO asset_snapshots (asset_key, asset_type, data_json, fetched_at) VALUES (?, ?, ?, ?)')
    .run(bankKey, 'STOCK', data, cachedAt)
}

describe('自选离线链路', () => {
  it('已知搜索结果名称时无需加载完整行情即可保存自选', async () => {
    await addWatchlistAsset({ assetKey: bankKey, name: ' 工商银行 ' })
    expect(await new WatchlistRepository().listAssets()).toEqual([
      { assetKey: bankKey, assetType: 'STOCK', market: 'A_SHARE', code: '601398', name: '工商银行' }
    ])
  })

  it('没有传入名称时仍从可用详情获取名称后保存', async () => {
    vi.mocked(StockAssetProvider.prototype.getDetail).mockResolvedValue(bankDetail())
    await addWatchlistAsset({ assetKey: bankKey })
    expect((await new WatchlistRepository().listAssets())[0]?.name).toBe('工商银行')
  })

  it('行情失败且没有快照时保留本地条目，价格明确缺失', async () => {
    await saveBank()
    const items = await listWatchlist()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ assetKey: bankKey, name: '工商银行', quoteStatus: 'unavailable' })
    expect(items[0].latestPrice).toBeUndefined()
    expect(items[0].estimatedFutureYield).toBeUndefined()
  })

  it('行情失败时使用过期快照，并标明缓存时间及过期状态', async () => {
    await saveBank()
    await saveOldSnapshot()
    const items = await listWatchlist()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ assetKey: bankKey, name: '工商银行', latestPrice: 7.36, quoteStatus: 'stale', quoteUpdatedAt: cachedAt })
  })

  it.each(['{invalid', '{}'])('损坏或不完整快照 %s 不会使自选条目消失', async (snapshot) => {
    await saveBank()
    await saveOldSnapshot(snapshot)
    const items = await listWatchlist()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ assetKey: bankKey, name: '工商银行', quoteStatus: 'unavailable' })
    expect(items[0].latestPrice).toBeUndefined()
  })

  it('可用行情与失败行情并存时保留全部自选及其相互独立的状态', async () => {
    await saveBank()
    await new WatchlistRepository().addAsset({ assetType: 'STOCK', market: 'A_SHARE', code: '600519', name: '贵州茅台' })
    vi.mocked(StockAssetProvider.prototype.getDetail).mockImplementation(async (identifier) => {
      if (identifier.code === '601398') return bankDetail()
      throw new Error('market data unavailable')
    })
    const items = await listWatchlist()
    expect(items).toHaveLength(2)
    expect(items.find((item) => item.code === '601398')).toMatchObject({ name: '工商银行', latestPrice: 7.36 })
    expect(items.find((item) => item.code === '600519')).toMatchObject({ name: '贵州茅台', quoteStatus: 'unavailable' })
  })

  it('断网后分组仍包含原来的本地成员', async () => {
    await saveBank()
    const groups = new WatchlistGroupRepository()
    const group = await groups.createGroup({ name: '离线测试组' })
    await groups.addToGroup(group.id, bankKey)
    const items = await listWatchlistGroupAssets(group.id)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ assetKey: bankKey, name: '工商银行', quoteStatus: 'unavailable' })
  })

  it('行情请求始终未完成时，两秒内返回已保存自选及缺失行情状态', async () => {
    await saveBank()
    const pending = deferred<StockAssetDetailSource>()
    vi.mocked(StockAssetProvider.prototype.getDetail).mockReturnValue(pending.promise)
    vi.useFakeTimers()
    let items: Awaited<ReturnType<typeof listWatchlist>> | undefined
    void listWatchlist().then(result => { items = result })
    await vi.advanceTimersByTimeAsync(2000)
    expect(items).toHaveLength(1)
    expect(items![0]).toMatchObject({ assetKey: bankKey, name: '工商银行', quoteStatus: 'unavailable' })
    expect(items![0].latestPrice).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('行情一直未完成时，两秒内复用过期快照并明确标记缓存时间', async () => {
    await saveBank()
    await saveOldSnapshot()
    vi.mocked(StockAssetProvider.prototype.getDetail).mockReturnValue(new Promise(() => {}))
    vi.useFakeTimers()
    let items: Awaited<ReturnType<typeof listWatchlist>> | undefined
    void listWatchlist().then(result => { items = result })
    await vi.advanceTimersByTimeAsync(2000)
    expect(items?.[0]).toMatchObject({ latestPrice: 7.36, quoteStatus: 'stale', quoteUpdatedAt: cachedAt })
  })

  it('超出展示预算后晚到的请求失败也被消费，不产生未处理拒绝', async () => {
    await saveBank()
    const pending = deferred<StockAssetDetailSource>()
    vi.mocked(StockAssetProvider.prototype.getDetail).mockReturnValue(pending.promise)
    vi.useFakeTimers()
    let items: Awaited<ReturnType<typeof listWatchlist>> | undefined
    void listWatchlist().then(result => { items = result })
    await vi.advanceTimersByTimeAsync(2000)
    expect(items).toHaveLength(1)
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      pending.reject(new Error('late market failure'))
      await vi.advanceTimersByTimeAsync(0)
      expect(unhandled).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('快速成功的行情直接返回真实数据，并清理展示预算定时器', async () => {
    await saveBank()
    vi.mocked(StockAssetProvider.prototype.getDetail).mockResolvedValue(bankDetail())
    vi.useFakeTimers()
    const items = await listWatchlist()
    expect(items[0]).toMatchObject({ assetKey: bankKey, latestPrice: 7.36 })
    expect(items[0].quoteStatus).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('超时后晚到的成功行情仍写快照，下次读取复用已完成数据', async () => {
    await saveBank()
    const pending = deferred<StockAssetDetailSource>()
    vi.mocked(StockAssetProvider.prototype.getDetail).mockReturnValue(pending.promise)
    vi.useFakeTimers()
    let items: Awaited<ReturnType<typeof listWatchlist>> | undefined
    void listWatchlist().then(result => { items = result })
    await vi.advanceTimersByTimeAsync(2000)
    expect(items?.[0].quoteStatus).toBe('unavailable')
    pending.resolve(bankDetail())
    await vi.advanceTimersByTimeAsync(0)
    expect(await new AssetSnapshotRepository().findByKey(bankKey)).toBeDefined()
    expect((await listWatchlist())[0]).toMatchObject({ assetKey: bankKey, latestPrice: 7.36 })
    expect(vi.mocked(StockAssetProvider.prototype.getDetail)).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
