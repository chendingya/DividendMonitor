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

let memoryDb: DatabaseSync

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
  beforeEach(() => {
    memoryDb = new DatabaseSync(':memory:')
    memoryDb.exec(createRequestCacheTable)
  })

  it('空表 get 返回 null', () => {
    const store = new SqliteRequestCacheStore()
    expect(store.get('missing:key')).toBeNull()
  })

  it('set 后 get 往返还原响应', () => {
    const store = new SqliteRequestCacheStore()
    const response = makeResponse({ code: '600519', price: 1450 })

    store.set('cap:{a:1}', {
      response,
      cachedAt: '2026-08-06T00:00:00.000Z'
    })

    const entry = store.get('cap:{a:1}')
    expect(entry?.response).toEqual(response)
    expect(entry?.cachedAt).toBe('2026-08-06T00:00:00.000Z')
  })

  it('delete 移除条目', () => {
    const store = new SqliteRequestCacheStore()
    store.set('cap:{a:1}', { response: makeResponse(1), cachedAt: '2026-08-06T00:00:00.000Z' })

    store.delete('cap:{a:1}')

    expect(store.get('cap:{a:1}')).toBeNull()
  })

  it('clear 清空全部条目', () => {
    const store = new SqliteRequestCacheStore()
    store.set('cap:{a:1}', { response: makeResponse(1), cachedAt: '2026-08-06T00:00:00.000Z' })
    store.set('cap:{a:2}', { response: makeResponse(2), cachedAt: '2026-08-06T00:00:00.000Z' })

    store.clear()

    expect(store.get('cap:{a:1}')).toBeNull()
    expect(store.get('cap:{a:2}')).toBeNull()
  })

  it('set 时惰性清理 7 天前的过期条目', () => {
    const store = new SqliteRequestCacheStore()
    const oldTs = new Date(Date.now() - 8 * DAY_MS).toISOString()
    store.set('cap:{old}', { response: makeResponse('old'), cachedAt: oldTs })

    store.set('cap:{new}', { response: makeResponse('new'), cachedAt: new Date().toISOString() })

    expect(store.get('cap:{old}')).toBeNull()
    expect(store.get('cap:{new}')).not.toBeNull()
  })

  it('损坏的 JSON 条目返回 null 而不抛错', () => {
    const store = new SqliteRequestCacheStore()
    memoryDb
      .prepare("INSERT INTO request_cache (cache_key, data_json, cached_at) VALUES ('cap:{bad}', 'not-json', '2026-08-06T00:00:00.000Z')")
      .run()

    expect(store.get('cap:{bad}')).toBeNull()
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

    expect(() => store.set('cap:{a:1}', { response: makeResponse(1), cachedAt: '2026-08-06T00:00:00.000Z' })).not.toThrow()
    expect(store.get('cap:{a:1}')).toBeNull()
    expect(() => store.delete('cap:{a:1}')).not.toThrow()
    expect(() => store.clear()).not.toThrow()
  })
})

describe('RequestCache + SqliteRequestCacheStore 集成', () => {
  beforeEach(() => {
    memoryDb = new DatabaseSync(':memory:')
    memoryDb.exec(createRequestCacheTable)
  })

  it('写入后新实例可从磁盘读回（进程重启持久化）', () => {
    const store = new SqliteRequestCacheStore()
    const first = new RequestCache(store)
    first.set('cap:{a:1}', makeResponse({ price: 1450 }))

    const second = new RequestCache(store)
    const cached = second.getFresh<{ price: number }>('cap:{a:1}', 60_000)

    expect(cached?.data).toEqual({ price: 1450 })
    expect(cached?.isStale).toBe(false)
  })

  it('磁盘条目过期时 getFresh 返回 null', () => {
    const store = new SqliteRequestCacheStore()
    store.set('cap:{a:1}', {
      response: makeResponse(1),
      cachedAt: new Date(Date.now() - 2 * 60_000).toISOString()
    })

    const cache = new RequestCache(store)
    expect(cache.getFresh<number>('cap:{a:1}', 1000)).toBeNull()
  })

  it('getStale 可从磁盘命中并标记 isStale', () => {
    const store = new SqliteRequestCacheStore()
    store.set('cap:{a:1}', {
      response: makeResponse(1),
      cachedAt: new Date(Date.now() - 60_000).toISOString()
    })

    const cache = new RequestCache(store)
    const cached = cache.getStale<number>('cap:{a:1}', 24 * 60 * 60 * 1000)

    expect(cached?.data).toBe(1)
    expect(cached?.isStale).toBe(true)
  })

  it('磁盘条目超过 staleTtl 时删除磁盘与内存并返回 null', () => {
    const store = new SqliteRequestCacheStore()
    store.set('cap:{a:1}', {
      response: makeResponse(1),
      cachedAt: new Date(Date.now() - 2 * DAY_MS).toISOString()
    })

    const cache = new RequestCache(store)
    expect(cache.getStale<number>('cap:{a:1}', DAY_MS)).toBeNull()
    expect(store.get('cap:{a:1}')).toBeNull()
  })

  it('磁盘命中后回填内存，后续不再查询磁盘', () => {
    const store = new SqliteRequestCacheStore()
    const diskGet = vi.spyOn(store, 'get')
    store.set('cap:{a:1}', { response: makeResponse(1), cachedAt: new Date().toISOString() })

    const cache = new RequestCache(store)
    cache.getFresh<number>('cap:{a:1}', 60_000)
    expect(diskGet).toHaveBeenCalledTimes(1)

    cache.getFresh<number>('cap:{a:1}', 60_000)
    expect(diskGet).toHaveBeenCalledTimes(1)
  })

  it('clear 同时清空磁盘与内存', () => {
    const store = new SqliteRequestCacheStore()
    store.set('cap:{a:1}', { response: makeResponse(1), cachedAt: new Date().toISOString() })
    const cache = new RequestCache(store)

    cache.clear()

    expect(cache.getFresh<number>('cap:{a:1}', 60_000)).toBeNull()
    expect(store.get('cap:{a:1}')).toBeNull()
  })
})
