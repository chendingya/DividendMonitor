import { createNodeSqliteDatabase } from '@main/infrastructure/db/nodeSqliteDatabase'
import type { SqliteDatabase } from '@main/infrastructure/db/databaseTypes'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestCache } from '@main/infrastructure/dataSources/cache/requestCache'
import type { SourceResponse } from '@main/infrastructure/dataSources/types/sourceTypes'

const createRequestCacheTable = `
  CREATE TABLE IF NOT EXISTS request_cache (
    cache_key TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    cached_at TEXT NOT NULL
  );
`

let memoryDb: SqliteDatabase

vi.mock('@main/infrastructure/db/sqlite', () => ({
  getDatabase: () => memoryDb
}))

const { SqliteRequestCacheStore } = await import(
  '@main/infrastructure/dataSources/cache/sqliteRequestCacheStore'
)

function makeResponse(payload: unknown): SourceResponse<unknown> {
  return {
    data: payload,
    provider: 'eastmoney',
    endpointId: 'eastmoney.test',
    isFallback: false,
    isStale: false,
    fetchedAt: '2026-08-06T00:00:00.000Z'
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

describe('SqliteRequestCacheStore', () => {
  beforeEach(async () => {
    memoryDb = createNodeSqliteDatabase(new DatabaseSync(':memory:'))
    await memoryDb.exec(createRequestCacheTable)
  })

  it('concurrent writes to the same cache key complete without duplicate-key failures', async () => {
    const store = new SqliteRequestCacheStore()
    const cachedAt = new Date().toISOString()
    await Promise.all([
      store.set('same', { response: makeResponse('first'), cachedAt }),
      store.set('same', { response: makeResponse('second'), cachedAt })
    ])
    expect((await store.get('same'))?.response.data).toBe('second')
  })

  it('a replaced provider connection is used after backup closes the old database', async () => {
    const store = new SqliteRequestCacheStore()
    await store.set('old', { response: makeResponse('old'), cachedAt: new Date().toISOString() })
    await memoryDb.close()
    memoryDb = createNodeSqliteDatabase(new DatabaseSync(':memory:'))
    await memoryDb.exec(createRequestCacheTable)
    expect(await store.get('old')).toBeNull()
  })

  it('空表 get 返回 null', async () => {
    const store = new SqliteRequestCacheStore()
    expect((await store.get('missing:key'))).toBeNull()
  })

  it('set 后 get 往返还原响应', async () => {
    const store = new SqliteRequestCacheStore()
    const response = makeResponse({ code: '600519', price: 1450 })
    // cachedAt 必须落在 7 天惰性清理窗口内，否则条目会在 set 时被立即清除
    const cachedAt = new Date().toISOString()

    await store.set('cap:{a:1}', {
      response,
      cachedAt
    })

    const entry = (await store.get('cap:{a:1}'))
    expect(entry?.response).toEqual(response)
    expect(entry?.cachedAt).toBe(cachedAt)
  })

  it('delete 移除条目', async () => {
    const store = new SqliteRequestCacheStore()
    await store.set('cap:{a:1}', { response: makeResponse(1), cachedAt: new Date().toISOString() })

    await store.delete('cap:{a:1}')

    expect((await store.get('cap:{a:1}'))).toBeNull()
  })

  it('clear 清空全部条目', async () => {
    const store = new SqliteRequestCacheStore()
    await store.set('cap:{a:1}', { response: makeResponse(1), cachedAt: new Date().toISOString() })
    await store.set('cap:{a:2}', { response: makeResponse(2), cachedAt: new Date().toISOString() })

    await store.clear()

    expect((await store.get('cap:{a:1}'))).toBeNull()
    expect((await store.get('cap:{a:2}'))).toBeNull()
  })

  it('set 时惰性清理 7 天前的过期条目', async () => {
    const store = new SqliteRequestCacheStore()
    const oldTs = new Date(Date.now() - 8 * DAY_MS).toISOString()
    await store.set('cap:{old}', { response: makeResponse('old'), cachedAt: oldTs })

    await store.set('cap:{new}', { response: makeResponse('new'), cachedAt: new Date().toISOString() })

    expect((await store.get('cap:{old}'))).toBeNull()
    expect((await store.get('cap:{new}'))).not.toBeNull()
  })

  it('损坏的 JSON 条目返回 null 而不抛错', async () => {
    const store = new SqliteRequestCacheStore()
    await memoryDb
      .prepare("INSERT INTO request_cache (cache_key, data_json, cached_at) VALUES ('cap:{bad}', 'not-json', '2026-08-06T00:00:00.000Z')")
      .run()

    expect((await store.get('cap:{bad}'))).toBeNull()
  })
})

describe('SqliteRequestCacheStore 降级', () => {
  it('SQLite 不可用时静默降级为纯内存，不抛错', async () => {
    vi.doMock('@main/infrastructure/db/sqlite', () => ({
      getDatabase: () => {
        throw new Error('no electron runtime')
      }
    }))
    vi.resetModules()

    const { SqliteRequestCacheStore: DegradedStore } = await import(
      '@main/infrastructure/dataSources/cache/sqliteRequestCacheStore'
    )
    const store = new DegradedStore()

    await expect(store.set('cap:{a:1}', { response: makeResponse(1), cachedAt: '2026-08-06T00:00:00.000Z' })).resolves.toBeUndefined()
    expect((await store.get('cap:{a:1}'))).toBeNull()
    await expect(store.delete('cap:{a:1}')).resolves.toBeUndefined()
    await expect(store.clear()).resolves.toBeUndefined()
  })
})

describe('RequestCache + SqliteRequestCacheStore 集成', () => {
  beforeEach(async () => {
    memoryDb = createNodeSqliteDatabase(new DatabaseSync(':memory:'))
    await memoryDb.exec(createRequestCacheTable)
  })

  it('写入后新实例可从磁盘读回（进程重启持久化）', async () => {
    const store = new SqliteRequestCacheStore()
    const first = new RequestCache(store)
    await first.set('cap:{a:1}', makeResponse({ price: 1450 }))

    const second = new RequestCache(store)
    const cached = (await second.getFresh<{ price: number }>('cap:{a:1}', 60_000))

    expect(cached?.data).toEqual({ price: 1450 })
    expect(cached?.isStale).toBe(false)
  })

  it('磁盘条目过期时 getFresh 返回 null', async () => {
    const store = new SqliteRequestCacheStore()
    await store.set('cap:{a:1}', {
      response: makeResponse(1),
      cachedAt: new Date(Date.now() - 2 * 60_000).toISOString()
    })

    const cache = new RequestCache(store)
    expect((await cache.getFresh<number>('cap:{a:1}', 1000))).toBeNull()
  })

  it('getStale 可从磁盘命中并标记 isStale', async () => {
    const store = new SqliteRequestCacheStore()
    await store.set('cap:{a:1}', {
      response: makeResponse(1),
      cachedAt: new Date(Date.now() - 60_000).toISOString()
    })

    const cache = new RequestCache(store)
    const cached = (await cache.getStale<number>('cap:{a:1}', 24 * 60 * 60 * 1000))

    expect(cached?.data).toBe(1)
    expect(cached?.isStale).toBe(true)
  })

  it('磁盘条目超过 staleTtl 时删除磁盘与内存并返回 null', async () => {
    const store = new SqliteRequestCacheStore()
    await store.set('cap:{a:1}', {
      response: makeResponse(1),
      cachedAt: new Date(Date.now() - 2 * DAY_MS).toISOString()
    })

    const cache = new RequestCache(store)
    expect((await cache.getStale<number>('cap:{a:1}', DAY_MS))).toBeNull()
    expect((await store.get('cap:{a:1}'))).toBeNull()
  })

  it('磁盘命中后回填内存，后续不再查询磁盘', async () => {
    const store = new SqliteRequestCacheStore()
    const diskGet = vi.spyOn(store, 'get')
    await store.set('cap:{a:1}', { response: makeResponse(1), cachedAt: new Date().toISOString() })

    const cache = new RequestCache(store)
    await cache.getFresh<number>('cap:{a:1}', 60_000)
    expect(diskGet).toHaveBeenCalledTimes(1)

    await cache.getFresh<number>('cap:{a:1}', 60_000)
    expect(diskGet).toHaveBeenCalledTimes(1)
  })

  it('clear 同时清空磁盘与内存', async () => {
    const store = new SqliteRequestCacheStore()
    await store.set('cap:{a:1}', { response: makeResponse(1), cachedAt: new Date().toISOString() })
    const cache = new RequestCache(store)

    await cache.clear()

    expect((await cache.getFresh<number>('cap:{a:1}', 60_000))).toBeNull()
    expect((await store.get('cap:{a:1}'))).toBeNull()
  })
})
