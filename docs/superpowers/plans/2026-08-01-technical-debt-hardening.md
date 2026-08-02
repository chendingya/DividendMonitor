# 三项技术债修复（HTTP API 文档 / 缓存层 / 页面状态组件）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `docs/FRONTEND-IMPLEMENTATION-PLAN.md` §8 第 9/10/11 条技术债：HTTP API 文档+端口可配置、缓存层务实小步（TimedCache + 估值 SQLite 缓存）、前端页面状态组件统一（useFetch + PageState）。

**Architecture:** 三个独立 Phase 顺序执行（A 缓存层 → B HTTP API → C 页面状态 → D 最终验收）。每个 Phase 独立可测可提交。缓存层遵循既有模式：`asset_snapshots`/`portfolio_risk_snapshots` 的 SQLite 表 + repository 模式（`vi.mock('@main/infrastructure/db/sqlite')` + `DatabaseSync(':memory:')` 测试）；前端遵循"对外 API 不变"原则渐进替换。

**Tech Stack:** TypeScript 5.8 strict、node:sqlite（无 ORM）、Vitest 4（node 环境，无 jsdom）、React 18 + antd 5、Electron 35。

**Spec:** `docs/superpowers/specs/2026-08-01-technical-debt-hardening-design.md`

## Global Constraints

- 迁移 hook/页面时**对外 API 完全不变**（页面调用处不改，除三态段本身）
- 渲染进程不新增测试基础设施（无 jsdom/@testing-library）；前端改动靠 `npm run typecheck` + MCP 端到端验收
- 缓存写失败（SQLite 异常）必须静默降级，不阻断主流程
- 估值"失败不写缓存"行为保持不变（缓存 undefined 仅限 indexCodeResolver 现有行为）
- 提交信息遵循 conventional commits（中文描述），不加 Co-Authored-By
- 每个任务完成后：`npm run typecheck` + 相关测试通过后才提交

---

# Phase A：缓存层

## Task A1: TimedCache 通用 TTL 缓存类

**Files:**
- Create: `src/main/infrastructure/cache/timedCache.ts`
- Test: `tests/main/infrastructure/timedCache.test.ts`

**Interfaces:**
- Produces: `export class TimedCache<K, V>` — `getFresh(key: K): { value: V } | undefined`、`set(key: K, value: V): void`、`delete(key: K): void`、`clear(): void`、`get size(): number`。`getFresh` 返回包裹对象以区分"未命中"与"缓存了 undefined"；过期条目在读取时惰性删除。

- [ ] **Step 1: 写失败测试**

创建 `tests/main/infrastructure/timedCache.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimedCache } from '@main/infrastructure/cache/timedCache'

describe('TimedCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns undefined when key is missing', () => {
    const cache = new TimedCache<string, number>(1000)
    expect(cache.getFresh('a')).toBeUndefined()
  })

  it('returns fresh value wrapped in object', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 42)
    expect(cache.getFresh('a')).toEqual({ value: 42 })
  })

  it('expires after ttl elapses', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 42)
    vi.advanceTimersByTime(1001)
    expect(cache.getFresh('a')).toBeUndefined()
  })

  it('does not expire exactly at ttl boundary', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 42)
    vi.advanceTimersByTime(1000)
    expect(cache.getFresh('a')).toEqual({ value: 42 })
  })

  it('can cache undefined values', () => {
    const cache = new TimedCache<string, number | undefined>(1000)
    cache.set('a', undefined)
    expect(cache.getFresh('a')).toEqual({ value: undefined })
  })

  it('set overwrites existing entry', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 1)
    cache.set('a', 2)
    expect(cache.getFresh('a')).toEqual({ value: 2 })
    expect(cache.size).toBe(1)
  })

  it('delete removes entry', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 1)
    cache.delete('a')
    expect(cache.getFresh('a')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('clear empties cache', () => {
    const cache = new TimedCache<string, number>(1000)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.getFresh('a')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/infrastructure/timedCache.test.ts`
Expected: FAIL — "Failed to resolve import"（模块不存在）

- [ ] **Step 3: 最小实现**

创建 `src/main/infrastructure/cache/timedCache.ts`：

```ts
type CacheEntry<V> = {
  expiresAt: number
  value: V
}

export class TimedCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>()

  constructor(private readonly ttlMs: number) {}

  getFresh(key: K): { value: V } | undefined {
    const entry = this.store.get(key)
    if (!entry || entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return { value: entry.value }
  }

  set(key: K, value: V): void {
    this.store.set(key, { expiresAt: Date.now() + this.ttlMs, value })
  }

  delete(key: K): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/main/infrastructure/timedCache.test.ts`
Expected: PASS（8 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/main/infrastructure/cache/timedCache.ts tests/main/infrastructure/timedCache.test.ts
git commit -m "feat(cache): 新增通用 TimedCache TTL 缓存类"
```

---

## Task A2: valuation_cache 表 + ValuationCacheRepository

**Files:**
- Modify: `src/main/infrastructure/db/sqlite.ts`（`createBaseSchema` 内，`portfolio_risk_snapshots` 块之后）
- Create: `src/main/repositories/valuationCacheRepository.ts`
- Test: `tests/main/repositories/valuationCacheRepository.test.ts`

**Interfaces:**
- Consumes: `getDatabase` from `@main/infrastructure/db/sqlite`
- Produces: `export type ValuationCacheRow = { cacheKey: string; dataJson: string; fetchedAt: string }`；`export class ValuationCacheRepository` — `upsert(cacheKey: string, dataJson: string): void`、`findByKey(cacheKey: string): ValuationCacheRow | undefined`、`findFreshByKey<T>(cacheKey: string, ttlMs: number): T | undefined`

- [ ] **Step 1: 写失败测试**

创建 `tests/main/repositories/valuationCacheRepository.test.ts`（参照 `tests/main/repositories/assetSnapshotRepository.test.ts` 的 mock 模式）：

```ts
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createValuationCacheTable = `
  CREATE TABLE IF NOT EXISTS valuation_cache (
    cache_key TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_valuation_cache_fetched_at ON valuation_cache(fetched_at DESC);
`

let memoryDb: DatabaseSync

vi.mock('@main/infrastructure/db/sqlite', () => ({
  getDatabase: () => memoryDb,
  getDatabaseFilePathForDebug: () => ':memory:'
}))

const { ValuationCacheRepository } = await import('@main/repositories/valuationCacheRepository')

describe('ValuationCacheRepository', () => {
  let repo: InstanceType<typeof ValuationCacheRepository>

  beforeEach(() => {
    memoryDb = new DatabaseSync(':memory:')
    memoryDb.exec(createValuationCacheTable)
    repo = new ValuationCacheRepository()
  })

  describe('upsert', () => {
    it('inserts a new entry', () => {
      repo.upsert('600519', JSON.stringify({ pe: { currentValue: 30 } }))

      const row = memoryDb
        .prepare('SELECT * FROM valuation_cache WHERE cache_key = ?')
        .get('600519') as Record<string, string>
      expect(row).toBeTruthy()
      expect(row.fetched_at).toBeTruthy()
      expect(JSON.parse(row.data_json)).toEqual({ pe: { currentValue: 30 } })
    })

    it('replaces existing entry on duplicate key', () => {
      repo.upsert('600519', JSON.stringify({ v: 1 }))
      repo.upsert('600519', JSON.stringify({ v: 2 }))

      const count = memoryDb
        .prepare('SELECT COUNT(*) AS c FROM valuation_cache WHERE cache_key = ?')
        .get('600519') as { c: number }
      expect(count.c).toBe(1)
      expect(repo.findFreshByKey<{ v: number }>('600519', 60_000)?.v).toBe(2)
    })
  })

  describe('findByKey', () => {
    it('returns undefined for a missing key', () => {
      expect(repo.findByKey('MISSING')).toBeUndefined()
    })

    it('returns the row for an existing key', () => {
      repo.upsert('510300', '{}')

      const row = repo.findByKey('510300')
      expect(row).toBeTruthy()
      expect(row!.cacheKey).toBe('510300')
      expect(row!.fetchedAt).toBeTruthy()
    })
  })

  describe('findFreshByKey', () => {
    it('returns undefined when no entry exists', () => {
      expect(repo.findFreshByKey('NONE', 60_000)).toBeUndefined()
    })

    it('returns parsed data for a fresh entry', () => {
      repo.upsert('600519', JSON.stringify({ pe: { currentValue: 30 } }))
      expect(repo.findFreshByKey<{ pe: { currentValue: number } }>('600519', 60_000)).toEqual({
        pe: { currentValue: 30 }
      })
    })

    it('returns undefined for a stale entry', () => {
      const old = new Date(Date.now() - 20 * 60 * 1000).toISOString()
      memoryDb
        .prepare('INSERT INTO valuation_cache VALUES (?, ?, ?)')
        .run('600519', JSON.stringify({ v: 1 }), old)

      expect(repo.findFreshByKey('600519', 15 * 60 * 1000)).toBeUndefined()
    })

    it('returns data within ttl', () => {
      const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      memoryDb
        .prepare('INSERT INTO valuation_cache VALUES (?, ?, ?)')
        .run('600519', JSON.stringify({ v: 9 }), recent)

      expect(repo.findFreshByKey<{ v: number }>('600519', 15 * 60 * 1000)).toEqual({ v: 9 })
    })

    it('returns undefined when JSON is corrupt', () => {
      memoryDb
        .prepare('INSERT INTO valuation_cache VALUES (?, ?, ?)')
        .run('BAD', '{not valid json', new Date().toISOString())

      expect(repo.findFreshByKey('BAD', 60_000)).toBeUndefined()
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/repositories/valuationCacheRepository.test.ts`
Expected: FAIL — "Failed to resolve import"

- [ ] **Step 3: 创建表结构**

在 `src/main/infrastructure/db/sqlite.ts` 的 `createBaseSchema` 中、`portfolio_risk_snapshots` 相关语句之后追加：

```ts
    CREATE TABLE IF NOT EXISTS valuation_cache (
      cache_key TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_valuation_cache_fetched_at
      ON valuation_cache(fetched_at DESC);
```

（插入位置：`idx_portfolio_risk_snapshots_fetched_at` 索引语句之后、`price_cache` 表之前。）

- [ ] **Step 4: 实现 repository**

创建 `src/main/repositories/valuationCacheRepository.ts`：

```ts
import { getDatabase } from '@main/infrastructure/db/sqlite'

export type ValuationCacheRow = {
  cacheKey: string
  dataJson: string
  fetchedAt: string
}

export class ValuationCacheRepository {
  upsert(cacheKey: string, dataJson: string): void {
    const db = getDatabase()
    db.prepare(
      `INSERT OR REPLACE INTO valuation_cache (cache_key, data_json, fetched_at)
       VALUES (?, ?, ?)`
    ).run(cacheKey, dataJson, new Date().toISOString())
  }

  findByKey(cacheKey: string): ValuationCacheRow | undefined {
    const db = getDatabase()
    const row = db
      .prepare('SELECT cache_key, data_json, fetched_at FROM valuation_cache WHERE cache_key = ?')
      .get(cacheKey) as Record<string, string> | undefined
    if (!row) return undefined
    return {
      cacheKey: row.cache_key,
      dataJson: row.data_json,
      fetchedAt: row.fetched_at
    }
  }

  findFreshByKey<T>(cacheKey: string, ttlMs: number): T | undefined {
    try {
      const row = this.findByKey(cacheKey)
      if (!row) return undefined
      const fetchedAtMs = new Date(row.fetchedAt).getTime()
      if (fetchedAtMs + ttlMs <= Date.now()) return undefined
      return JSON.parse(row.dataJson) as T
    } catch {
      return undefined
    }
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/main/repositories/valuationCacheRepository.test.ts`
Expected: PASS（11 个用例）

- [ ] **Step 6: 提交**

```bash
git add src/main/infrastructure/db/sqlite.ts src/main/repositories/valuationCacheRepository.ts tests/main/repositories/valuationCacheRepository.test.ts
git commit -m "feat(cache): 新增 valuation_cache 表与 ValuationCacheRepository"
```

---

## Task A3: ValuationRepository 双层缓存改造

**Files:**
- Modify: `src/main/repositories/valuationRepository.ts`
- Test: `tests/main/repositories/valuationRepository.test.ts`

**Interfaces:**
- Consumes: `TimedCache`（Task A1）、`ValuationCacheRepository`（Task A2）
- Produces: 不变 — `getStockValuation(symbol: string): Promise<StockValuationSource | undefined>`；构造函数增加可选参数 `diskCache: ValuationCacheRepository`

- [ ] **Step 1: 写失败测试**

创建 `tests/main/repositories/valuationRepository.test.ts`：

```ts
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
    expect(diskCache.findFreshByKey).not.toHaveBeenCalled()
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
```

注意：`new ValuationRepository(dataSource, diskCache)` 依赖构造函数签名 `(dataSource, diskCache)`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/repositories/valuationRepository.test.ts`
Expected: FAIL — 构造函数不接受第二个参数（TS 编译错误）或断言失败

- [ ] **Step 3: 改造实现**

将 `src/main/repositories/valuationRepository.ts` 全部内容替换为：

```ts
import type { StockValuationSource } from '@main/adapters/contracts'
import { createValuationDataSource } from '@main/adapters'
import type {
  ValuationDataSource,
  ValuationIndicatorType,
  ValuationSnapshotSource
} from '@main/adapters/contracts'
import type { ValuationMetric, ValuationTrendPoint } from '@main/domain/services/valuationService'
import { TimedCache } from '@main/infrastructure/cache/timedCache'
import { ValuationCacheRepository } from '@main/repositories/valuationCacheRepository'

const VALUATION_CACHE_TTL_MS = 15 * 60 * 1000

function buildMetric(snapshot: ValuationSnapshotSource | undefined, history: ValuationTrendPoint[]): ValuationMetric | undefined {
  const currentValue = snapshot?.currentValue ?? history[0]?.value

  if (currentValue == null && history.length === 0) {
    return undefined
  }

  return {
    currentValue: currentValue != null && currentValue > 0 ? currentValue : undefined,
    currentPercentile:
      snapshot?.currentPercentile != null && snapshot.currentPercentile >= 0 ? snapshot.currentPercentile : undefined,
    status: snapshot?.status,
    history
  }
}

export class ValuationRepository {
  private readonly memoryCache = new TimedCache<string, StockValuationSource>(VALUATION_CACHE_TTL_MS)

  constructor(
    private readonly dataSource: ValuationDataSource = createValuationDataSource(),
    private readonly diskCache: ValuationCacheRepository = new ValuationCacheRepository()
  ) {}

  async getStockValuation(symbol: string): Promise<StockValuationSource | undefined> {
    const memoryHit = this.memoryCache.getFresh(symbol)
    if (memoryHit) {
      return memoryHit.value
    }

    const diskHit = this.diskCache.findFreshByKey<StockValuationSource>(symbol, VALUATION_CACHE_TTL_MS)
    if (diskHit) {
      this.memoryCache.set(symbol, diskHit)
      return diskHit
    }

    // SourceGateway handles provider-level concurrency, so Promise.all here is safe.
    const [pe, pb] = await Promise.all([this.resolveMetric(symbol, 1), this.resolveMetric(symbol, 2)])
    const valuation =
      pe || pb
        ? {
            pe,
            pb
          }
        : undefined

    // Only cache successful results. Caching undefined would block retries
    // for the full TTL duration after a transient failure.
    if (valuation) {
      this.memoryCache.set(symbol, valuation)
      try {
        this.diskCache.upsert(symbol, JSON.stringify(valuation))
      } catch {
        // 磁盘缓存写失败不阻断主流程
      }
    }

    return valuation
  }

  private async resolveMetric(symbol: string, indicatorType: ValuationIndicatorType): Promise<ValuationMetric | undefined> {
    const [snapshotResult, trendResult] = await Promise.allSettled([
      this.dataSource.getSnapshot(symbol, indicatorType),
      this.dataSource.getTrend(symbol, indicatorType)
    ])

    const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : undefined
    const history = trendResult.status === 'fulfilled' ? trendResult.value : []

    return buildMetric(snapshot, history)
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/main/repositories/valuationRepository.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 5: 全量回归 + 提交**

Run: `npx vitest run`
Expected: 全部 PASS（含既有 assetSnapshotRepository 等）

```bash
git add src/main/repositories/valuationRepository.ts tests/main/repositories/valuationRepository.test.ts
git commit -m "feat(cache): 股票估值仓库双层缓存（内存 TimedCache + SQLite）"
```

---

## Task A4: IndexValuationRepository + indexCodeResolver 改造

**Files:**
- Modify: `src/main/repositories/indexValuationRepository.ts`
- Modify: `src/main/repositories/indexCodeResolver.ts`

**Interfaces:**
- Consumes: `TimedCache`（Task A1）、`ValuationCacheRepository`（Task A2）
- Produces: 不变 — `getIndexValuation(indexName: string): Promise<IndexValuationSource | undefined>`；`resolveIndexCode(indexName: string): Promise<IndexCodeResult | undefined>`；`clearIndexCodeCache(): void`

- [ ] **Step 1: 改造 IndexValuationRepository**

将 `src/main/repositories/indexValuationRepository.ts` 替换为：

```ts
import type { ValuationMetric, ValuationTrendPoint } from '@main/domain/services/valuationService'
import type { ValuationDataSource, ValuationSnapshotSource } from '@main/adapters/contracts'
import type { IndexValuationSnapshotAdapter } from '@main/adapters/danjuan/danjuanIndexValuationAdapter'
import { DanjuanIndexValuationAdapter } from '@main/adapters/danjuan/danjuanIndexValuationAdapter'
import { resolveIndexCode } from '@main/repositories/indexCodeResolver'
import { createValuationDataSource } from '@main/adapters'
import { TimedCache } from '@main/infrastructure/cache/timedCache'
import { ValuationCacheRepository } from '@main/repositories/valuationCacheRepository'

export type IndexValuationSource = {
  indexCode: string
  indexName: string
  source: 'eastmoney' | 'danjuan'
  pe?: ValuationMetric
  pb?: ValuationMetric
  hasHistory: boolean
}

const INDEX_VALUATION_CACHE_TTL_MS = 15 * 60 * 1000

function buildMetric(snapshot: ValuationSnapshotSource | undefined, history: ValuationTrendPoint[]): ValuationMetric | undefined {
  const currentValue = snapshot?.currentValue ?? history[0]?.value

  if (currentValue == null && history.length === 0) {
    return undefined
  }

  return {
    currentValue: currentValue != null && currentValue > 0 ? currentValue : undefined,
    currentPercentile:
      snapshot?.currentPercentile != null && snapshot.currentPercentile >= 0 ? snapshot.currentPercentile : undefined,
    status: snapshot?.status,
    history
  }
}

export class IndexValuationRepository {
  private readonly memoryCache = new TimedCache<string, IndexValuationSource>(INDEX_VALUATION_CACHE_TTL_MS)

  constructor(
    private readonly eastmoneyDataSource: ValuationDataSource = createValuationDataSource(),
    private readonly danjuanAdapter: IndexValuationSnapshotAdapter = new DanjuanIndexValuationAdapter(),
    private readonly diskCache: ValuationCacheRepository = new ValuationCacheRepository()
  ) {}

  async getIndexValuation(indexName: string): Promise<IndexValuationSource | undefined> {
    const indexResult = await resolveIndexCode(indexName)
    if (!indexResult) {
      return undefined
    }

    const { code: indexCode, name: resolvedName, market } = indexResult

    const memoryHit = this.memoryCache.getFresh(indexCode)
    if (memoryHit) {
      return memoryHit.value
    }

    const diskHit = this.diskCache.findFreshByKey<IndexValuationSource>(indexCode, INDEX_VALUATION_CACHE_TTL_MS)
    if (diskHit) {
      this.memoryCache.set(indexCode, diskHit)
      return diskHit
    }

    const eastmoneyResult = await this.tryEastmoney(indexCode, resolvedName)
    if (eastmoneyResult) {
      this.cacheResult(indexCode, eastmoneyResult)
      return eastmoneyResult
    }

    const danjuanResult = await this.tryDanjuan(indexCode, resolvedName, market)
    if (danjuanResult) {
      this.cacheResult(indexCode, danjuanResult)
      return danjuanResult
    }

    return undefined
  }

  private async tryEastmoney(indexCode: string, indexName: string): Promise<IndexValuationSource | undefined> {
    const [pe, pb] = await Promise.all([
      this.resolveEastmoneyMetric(indexCode, 1),
      this.resolveEastmoneyMetric(indexCode, 2)
    ])

    if (!pe && !pb) return undefined

    return {
      indexCode,
      indexName,
      source: 'eastmoney',
      pe,
      pb,
      hasHistory: true
    }
  }

  private async tryDanjuan(indexCode: string, indexName: string, market: 'SH' | 'SZ'): Promise<IndexValuationSource | undefined> {
    const snapshot = await this.danjuanAdapter.getIndexSnapshot(indexCode, market)
    if (!snapshot) return undefined

    return {
      indexCode,
      indexName,
      source: 'danjuan',
      pe: {
        currentValue: snapshot.currentValue,
        currentPercentile: snapshot.currentPercentile,
        status: snapshot.status === 'low' ? '估值较低' : snapshot.status === 'high' ? '估值较高' : '估值中等',
        history: []
      },
      hasHistory: false
    }
  }

  private async resolveEastmoneyMetric(indexCode: string, indicatorType: 1 | 2): Promise<ValuationMetric | undefined> {
    const [snapshotResult, trendResult] = await Promise.allSettled([
      this.eastmoneyDataSource.getSnapshot(indexCode, indicatorType),
      this.eastmoneyDataSource.getTrend(indexCode, indicatorType)
    ])

    const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : undefined
    const history = trendResult.status === 'fulfilled' ? trendResult.value : []

    // 东方财富 RPT_VALUATIONSTATUS 接口对指数返回 PE/PB*100（如 519.45 实际应为 ~5.19），
    // 而对股票返回正确值。指数 PE/PB 不可能超过 100，据此修正。
    if (snapshot?.currentValue != null && snapshot.currentValue > 100) {
      snapshot.currentValue = snapshot.currentValue / 100
    }

    return buildMetric(snapshot, history)
  }

  private cacheResult(indexCode: string, value: IndexValuationSource): void {
    this.memoryCache.set(indexCode, value)
    try {
      this.diskCache.upsert(indexCode, JSON.stringify(value))
    } catch {
      // 磁盘缓存写失败不阻断主流程
    }
  }
}
```

- [ ] **Step 2: 改造 indexCodeResolver**

将 `src/main/repositories/indexCodeResolver.ts` 替换为：

```ts
import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'
import type { EastmoneySuggestItem } from '@main/infrastructure/dataSources/registry/eastmoneyEndpoints'
import { TimedCache } from '@main/infrastructure/cache/timedCache'

export type IndexCodeResult = {
  code: string
  name: string
  market: 'SH' | 'SZ'
}

const INDEX_CODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const indexCodeCache = new TimedCache<string, IndexCodeResult | undefined>(INDEX_CODE_CACHE_TTL_MS)

function normalizeIndexName(name: string): string {
  return name
    .trim()
    .replace(/\(.*?\)/g, '')   // 去除括号内容，如 "创业板指数(价格)" → "创业板指数"
    .replace(/（.*?）/g, '')    // 去除全角括号内容
    .replace(/人民币$/u, '')    // 去除货币后缀
    .replace(/指数$/u, '')      // 去除"指数"后缀
    .replace(/[　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchBestResult(items: EastmoneySuggestItem[], normalizedName: string): EastmoneySuggestItem | undefined {
  const indices = items.filter((item) => item.SecurityType === '5' && item.Code)

  if (indices.length === 0) {
    return undefined
  }

  const exact = indices.find((item) => item.Name === normalizedName || normalizeIndexName(item.Name ?? '') === normalizedName)
  if (exact) {
    return exact
  }

  const prefix = indices.find((item) => (item.Name ?? '').startsWith(normalizedName) || normalizeIndexName(item.Name ?? '').startsWith(normalizedName))
  if (prefix) {
    return prefix
  }

  return indices[0]
}

async function searchIndices(keyword: string): Promise<EastmoneySuggestItem[]> {
  try {
    const response = await getDefaultSourceGateway().request<{ keyword: string; count: number }, EastmoneySuggestItem[]>({
      capability: 'asset.search',
      input: { keyword, count: 20 }
    })
    return response.data
  } catch {
    return []
  }
}

function generateSearchKeywords(normalizedName: string): string[] {
  const keywords = [normalizedName]

  // 去除常见前缀组合
  const prefixes = ['中证全指', '中证海外', '中证', '全指', '国证', '上证', '深证', '恒生']
  for (const prefix of prefixes) {
    if (normalizedName.startsWith(prefix)) {
      const stripped = normalizedName.slice(prefix.length).trim()
      if (stripped) {
        keywords.push(stripped)
      }
    }
  }

  // 去除货币/修饰词后缀
  const suffixPatterns = [/人民币$/u, /美元$/u, /港币$/u]
  for (const pattern of suffixPatterns) {
    const stripped = normalizedName.replace(pattern, '').trim()
    if (stripped && stripped !== normalizedName) {
      keywords.push(stripped)
    }
  }

  return [...new Set(keywords)]
}

export async function resolveIndexCode(indexName: string): Promise<IndexCodeResult | undefined> {
  const normalized = normalizeIndexName(indexName)
  if (!normalized) {
    return undefined
  }

  const cached = indexCodeCache.getFresh(indexName)
  if (cached) {
    return cached.value
  }

  // 尝试多个关键词搜索
  const searchKeywords = generateSearchKeywords(normalized)
  for (const keyword of searchKeywords) {
    const items = await searchIndices(keyword)
    const best = matchBestResult(items, normalized)
    if (best) {
      const result: IndexCodeResult = {
        code: best.Code!,
        name: best.Name!,
        market: (best.MktNum === '1' ? 'SH' : 'SZ')
      }
      indexCodeCache.set(indexName, result)
      return result
    }
  }

  indexCodeCache.set(indexName, undefined)
  return undefined
}

export function clearIndexCodeCache(): void {
  indexCodeCache.clear()
}
```

- [ ] **Step 3: 验证**

Run: `npm run typecheck`
Expected: 无错误

Run: `npx vitest run`
Expected: 全部 PASS（行为未变，无新增测试）

- [ ] **Step 4: 提交**

```bash
git add src/main/repositories/indexValuationRepository.ts src/main/repositories/indexCodeResolver.ts
git commit -m "refactor(cache): 指数估值与指数代码解析改用 TimedCache 并落盘估值结果"
```

---

# Phase B：HTTP API 文档 + 端口可配置

## Task B1: server.ts 支持 LOCAL_HTTP_API_PORT

**Files:**
- Modify: `src/main/http/server.ts`

**Interfaces:**
- Produces: 不变 — `startLocalHttpServer()`、`stopLocalHttpServer()`

- [ ] **Step 1: 实现端口可配置**

在 `src/main/http/server.ts` 中，将 `getBaseUrl()` 替换为：

```ts
function getBaseUrl() {
  const port = process.env['LOCAL_HTTP_API_PORT']?.trim()
  if (port && /^\d+$/.test(port)) {
    return new URL(`http://127.0.0.1:${port}`)
  }
  return new URL(LOCAL_HTTP_API_ORIGIN)
}
```

将 `handleRequest` 内 `const url = new URL(request.url ?? '/', LOCAL_HTTP_API_ORIGIN)` 改为：

```ts
  const url = new URL(request.url ?? '/', getBaseUrl())
```

在 `startLocalHttpServer()` 的 `listen` 回调中追加日志（`resolve()` 之前）：

```ts
      console.log(`[http-api] listening on http://${host}:${port}`)
```

CORS 白名单与 `Access-Control-Allow-Origin` 回退值保持不变（现有正则 `/^http:\/\/(127\.0\.0\.1|localhost):\d+$/` 已覆盖任意本地端口）。

- [ ] **Step 2: 验证编译**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3: 默认端口冒烟验证**

后台启动（PowerShell 作业，日志写文件）：

```powershell
$job = Start-Job -ScriptBlock {
  Set-Location 'I:\code\DividendMonitor'
  $env:DIVIDEND_MONITOR_HEADLESS = '1'
  npx electron-vite dev 2>&1 | Out-File -FilePath 'C:\Users\15845\AppData\Local\Temp\opencode\httpapi-default.log' -Encoding utf8
}
```

等待就绪（轮询，最多 60 秒）：

```powershell
for ($i = 0; $i -lt 60; $i++) {
  try { $r = Invoke-RestMethod 'http://127.0.0.1:3210/api/security/nonce' -TimeoutSec 2; break } catch { Start-Sleep -Seconds 1 }
}
$r | ConvertTo-Json
```

Expected: 返回包含 `nonce` 的 JSON（如 `{ "nonce": "..." }`）。验证后停止作业：`Stop-Job $job; Remove-Job $job`。

- [ ] **Step 4: 自定义端口验证**

```powershell
$job = Start-Job -ScriptBlock {
  Set-Location 'I:\code\DividendMonitor'
  $env:DIVIDEND_MONITOR_HEADLESS = '1'
  $env:LOCAL_HTTP_API_PORT = '3999'
  npx electron-vite dev 2>&1 | Out-File -FilePath 'C:\Users\15845\AppData\Local\Temp\opencode\httpapi-3999.log' -Encoding utf8
}
for ($i = 0; $i -lt 60; $i++) {
  try { $r = Invoke-RestMethod 'http://127.0.0.1:3999/api/security/nonce' -TimeoutSec 2; break } catch { Start-Sleep -Seconds 1 }
}
$r | ConvertTo-Json
```

Expected: 3999 端口返回 nonce；同时 `http://127.0.0.1:3210` 应连接失败（无服务监听）。验证后 `Stop-Job $job; Remove-Job $job`。

- [ ] **Step 5: 提交**

```bash
git add src/main/http/server.ts
git commit -m "feat(http): 支持 LOCAL_HTTP_API_PORT 环境变量覆盖监听端口"
```

---

## Task B2: docs/HTTP-API.md + 索引更新

**Files:**
- Create: `docs/HTTP-API.md`
- Modify: `docs/README.md`（索引列表追加条目）
- Modify: `docs/FRONTEND-IMPLEMENTATION-PLAN.md`（§8 未完成项删除第 1 条）

- [ ] **Step 1: 核对路由清单**

遍历 `src/main/http/routes/` 下 11 个文件（`assetRoutes / authRoutes / calculationRoutes / dividendRoutes / fxRoutes / industryRoutes / portfolioRoutes / securityRoutes / settingsRoutes / syncRoutes / watchlistRoutes`），用 grep 提取每个 `if (pathname === ...)` 或 `startsWith` 条件，整理出完整的"方法 + 路径"清单。已知端点（Step 2 文档中使用，如与代码不符以代码为准修正）：

```
GET  /api/asset/search            GET  /api/asset/detail          POST /api/asset/compare
POST /api/auth/login              POST /api/auth/register         POST /api/auth/logout
GET  /api/auth/session            POST /api/auth/update-password  GET  /auth/callback
POST /api/auth/confirm
GET  /api/calculation/historical-yield   GET /api/calculation/estimate-future-yield
POST /api/calculation/backtest    GET  /api/backtest/history      POST /api/backtest/history
DELETE /api/backtest/history/:id
GET  /api/dividend/history        POST /api/dividend/history      GET /api/dividend/upcoming
GET  /api/dividend/forecast
GET  /api/fx/usd-cny-rate
GET  /api/industry/analysis       GET  /api/industry/distribution  GET /api/industry/benchmark
GET  /api/portfolio               POST /api/portfolio             DELETE /api/portfolio
POST /api/portfolio/remove        POST /api/portfolio/remove-by-asset  POST /api/portfolio/replace-by-asset
GET  /api/portfolio/risk-metrics
GET  /api/security/nonce
GET  /api/settings                PUT  /api/settings              DELETE /api/settings
POST /api/sync/data               GET  /api/sync/status
GET  /api/watchlist               POST /api/watchlist/add-asset   POST /api/watchlist/remove-asset
GET  /api/watchlist/groups        POST /api/watchlist/groups      PUT  /api/watchlist/groups/:id
DELETE /api/watchlist/groups/:id  POST /api/watchlist/groups/add-asset
POST /api/watchlist/groups/remove-asset  GET /api/watchlist/groups/:id/assets
GET  /api/watchlist/asset-groups/:key
```

- [ ] **Step 2: 编写 docs/HTTP-API.md**

创建 `docs/HTTP-API.md`，内容结构（含 Step 1 核对后的完整路由清单）：

```markdown
# 本地 HTTP API（headless 模式）

> 本文档描述无头主进程（headless runtime）提供的本地 HTTP API：
> 用途、启动方式、环境变量、认证机制与完整路由清单。
> 桌面模式（Electron IPC）不受本文档影响，接口契约见 `docs/IPC-CONTRACTS.md`。

## 1. 用途与适用场景

- 浏览器预览联调（`npm run dev:browser-preview`）
- 自动化测试与脚本化数据访问（同一台机器）
- 无 UI 环境下驱动主进程数据链路

桌面版与浏览器预览共用同一主进程逻辑；HTTP API 是主进程能力的本地透出，
**不是公网服务**，不应暴露到非本机网络。

## 2. 启动方式

### 方式一：浏览器预览（推荐）

npm run dev:browser-preview

等价于设置 `DIVIDEND_MONITOR_HEADLESS=1` 后运行 `electron-vite dev`，
不创建应用窗口，仅启动主进程与本地 HTTP 服务。

### 方式二：手动无头启动

$env:DIVIDEND_MONITOR_HEADLESS = '1'
npx electron-vite dev

## 3. 环境变量

| 变量 | 取值 | 默认 | 说明 |
|------|------|------|------|
| `DIVIDEND_MONITOR_HEADLESS` | `1` 启用无头 | 空（桌面模式） | 无头模式下不创建窗口 |
| `LOCAL_HTTP_API_PORT` | 端口号（纯数字） | `3210` | 覆盖 HTTP API 监听端口；未设置时使用 `http://127.0.0.1:3210` |

修改端口后访问基址同步变化（如 `LOCAL_HTTP_API_PORT=3999` → `http://127.0.0.1:3999`）。
渲染进程的前端基址常量保持默认 `http://127.0.0.1:3210`，自定义端口主要用于脚本化联调。

## 4. 认证机制（X-Local-Nonce）

HTTP API 仅允许本机访问，但部分敏感路由（auth/sync 域）要求携带本地一次性 nonce：

1. `GET /api/security/nonce` → 返回 `{ "nonce": "<随机值>" }`
2. 后续请求在 header 携带 `X-Local-Nonce: <nonce>`（示例见下）
3. nonce 由主进程在会话启动时生成并注入渲染页面 `<meta name="local-nonce">`；
   浏览器预览页会自动带上该头，无需手工处理

示例（PowerShell）：

$nonce = (Invoke-RestMethod 'http://127.0.0.1:3210/api/security/nonce').nonce
Invoke-RestMethod 'http://127.0.0.1:3210/api/auth/session' -Headers @{ 'X-Local-Nonce' = $nonce }

要求 `X-Local-Nonce` 的路由：`/api/auth/*`、`/api/sync/*`。
不带或携带无效 nonce 时返回 401。

## 5. 完整路由清单

<Step 1 核对后的完整清单：按域分组列出 方法/路径/参数/响应概要，含 CORS 说明>

### 5.1 资产域（asset）
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/asset/search` | `keyword`（query） | 搜索股票/ETF/基金/贵金属 |
| GET | `/api/asset/detail` | `assetKey` 或 `code`+`assetType`（query） | 资产详情（含估值、股息率） |
| POST | `/api/asset/compare` | body：`{ items: [{ assetKey }] }` | 多资产对比 |

### 5.2 认证域（auth）
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| POST | `/api/auth/login` | body：`{ email, password }` | 登录 |
| POST | `/api/auth/register` | body：`{ email, password, confirmPassword }` | 注册 |
| POST | `/api/auth/logout` | — | 登出 |
| GET | `/api/auth/session` | — | 当前会话 |
| POST | `/api/auth/update-password` | body：`{ oldPassword, newPassword, confirmPassword }` | 修改密码 |
| GET | `/auth/callback` | `code`、`state`（query） | Supabase OAuth 回调 |
| POST | `/api/auth/confirm` | body：`{ token, email }` | 邮箱确认 |

### 5.3 计算域（calculation / backtest）
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/calculation/historical-yield` | `symbol`、`yearFrom`、`yearTo` | 自然年股息率 |
| GET | `/api/calculation/estimate-future-yield` | `symbol` | 未来股息率估算 |
| POST | `/api/calculation/backtest` | body：`{ symbol, buyDate, ... }` | 股息复投回测 |
| GET | `/api/backtest/history` | — | 回测历史列表 |
| POST | `/api/backtest/history` | body：`{ name, buyDate, ... }` | 保存回测 |
| DELETE | `/api/backtest/history/:id` | — | 删除回测记录 |

### 5.4 分红域（dividend）
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/dividend/history` | `assetKey`、`yearFrom`、`yearTo` | 分红历史 |
| POST | `/api/dividend/history` | body：`{ assetKey, events }` | 写入分红事件 |
| GET | `/api/dividend/upcoming` | `assetKeys`（逗号分隔） | 即将分红（已公告未派发） |
| GET | `/api/dividend/forecast` | `assetKey` | 未来分红预测 |

### 5.5 汇率域（fx）
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/fx/usd-cny-rate` | — | 美元/人民币汇率 |

### 5.6 行业域（industry）
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/industry/analysis` | — | 持仓行业分布分析 |
| GET | `/api/industry/distribution` | — | 行业分布数据 |
| GET | `/api/industry/benchmark` | `industryName` | 行业基准对比 |

### 5.7 持仓域（portfolio）
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/portfolio` | — | 持仓列表 |
| POST | `/api/portfolio` | body：`{ assetKey, shares, avgCost, ... }` | 新增/更新持仓 |
| DELETE | `/api/portfolio` | body：`{ id }` | 删除持仓 |
| POST | `/api/portfolio/remove` | body：`{ id }` | 按 id 移除 |
| POST | `/api/portfolio/remove-by-asset` | body：`{ assetKey }` | 按资产移除 |
| POST | `/api/portfolio/replace-by-asset` | body：`{ assetKey, positions }` | 替换资产持仓 |
| GET | `/api/portfolio/risk-metrics` | `assetKey`、`marketValue`（query 多值） | 组合风险指标 |

### 5.8 安全域（security）
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/security/nonce` | — | 获取本地 nonce |

### 5.9 设置域（settings）
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/settings` | — | 读取设置 |
| PUT | `/api/settings` | body：`{ key: value }` | 更新设置 |
| DELETE | `/api/settings` | body：`{ key }` | 删除设置项 |

### 5.10 同步域（sync，要求 nonce）
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| POST | `/api/sync/data` | body：`{ direction, tables, ... }` | 推送/拉取/双向同步 |
| GET | `/api/sync/status` | — | 同步状态 |

### 5.11 自选域（watchlist）
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/watchlist` | — | 自选列表 |
| POST | `/api/watchlist/add-asset` | body：`{ assetKey }` 或 `{ code }` | 添加自选 |
| POST | `/api/watchlist/remove-asset` | body：`{ assetKey }` | 移除自选 |
| GET | `/api/watchlist/groups` | — | 分组列表 |
| POST | `/api/watchlist/groups` | body：`{ name, color, sortOrder }` | 新建分组 |
| PUT | `/api/watchlist/groups/:id` | body：`{ name, color, sortOrder }` | 更新分组 |
| DELETE | `/api/watchlist/groups/:id` | — | 删除分组 |
| POST | `/api/watchlist/groups/add-asset` | body：`{ groupId, assetKey }` | 加入分组 |
| POST | `/api/watchlist/groups/remove-asset` | body：`{ groupId, assetKey }` | 移出分组 |
| GET | `/api/watchlist/groups/:id/assets` | — | 分组内资产 |
| GET | `/api/watchlist/asset-groups/:key` | — | 资产所属分组 |

## 6. CORS 与安全

- 仅允许同源与本地开发源（`http://127.0.0.1:<任意端口>`、`http://localhost:<任意端口>`）
- 响应附带安全头（CSP 等，见 `src/main/security/contentSecurityPolicy.ts`）
- 本服务只绑定本机回环地址，切勿反向代理到公网

## 7. 公网部署方向

将本服务暴露到公网存在两个阻塞点，改造方向见 `docs/PACKAGING-AND-DEPLOYMENT.md`：
1. 前端 API 基址硬编码（需 `VITE_API_BASE_URL` 配置化）
2. HTTP 服务内嵌于 Electron 主进程（需独立 Node 进程 + 真实鉴权）
```

- [ ] **Step 3: 更新 docs/README.md 索引**

在 `docs/README.md` 的文档列表中追加：

```markdown
- 本地 HTTP API 说明：`docs/HTTP-API.md`
```

（按现有列表格式与位置插入。）

- [ ] **Step 4: 勾掉 FRONTEND-IMPLEMENTATION-PLAN.md 未完成项**

删除 `docs/FRONTEND-IMPLEMENTATION-PLAN.md` §8 中第 1 条 `1. 本地 HTTP API 的部署/启动说明还需要继续完善`（若剩 3 条则相应调整序号，无需重排后续小节）。

- [ ] **Step 5: 提交**

```bash
git add docs/HTTP-API.md docs/README.md docs/FRONTEND-IMPLEMENTATION-PLAN.md
git commit -m "docs(http): 新增本地 HTTP API 文档并更新索引"
```

---

## Task B3: HTTP API 端到端 MCP 验收

**Files:**
- 无代码改动（验收任务）

**Prerequisites:** Task B1、B2 已完成。

- [ ] **Step 1: 启动 headless 运行时（后台）**

```powershell
$job = Start-Job -ScriptBlock {
  Set-Location 'I:\code\DividendMonitor'
  $env:DIVIDEND_MONITOR_HEADLESS = '1'
  npx electron-vite dev 2>&1 | Out-File -FilePath 'C:\Users\15845\AppData\Local\Temp\opencode\e2e-httpapi.log' -Encoding utf8
}
```

- [ ] **Step 2: nonce 端点**

轮询 `http://127.0.0.1:3210/api/security/nonce`（最多 60 秒），确认返回含 `nonce` 字段。通过标准：返回 `{ nonce: string }`。

- [ ] **Step 3: 认证链路（带 nonce 通过 / 不带拒绝）**

```powershell
$nonce = (Invoke-RestMethod 'http://127.0.0.1:3210/api/security/nonce').nonce
$withHeader = Invoke-RestMethod 'http://127.0.0.1:3210/api/auth/session' -Headers @{ 'X-Local-Nonce' = $nonce }
$withHeader | ConvertTo-Json
```

Expected: 返回会话信息（可能为 `{ user: null }`），HTTP 200。再验证不带 nonce：

```powershell
try {
  Invoke-WebRequest 'http://127.0.0.1:3210/api/auth/session' -UseBasicParsing | Out-Null
  'FAIL: 应该被拒绝'
} catch {
  "PASS: 状态码 $($_.Exception.Response.StatusCode.value__)"
}
```

Expected: 401。

- [ ] **Step 4: 抽查代表性端点（与文档清单一致）**

```powershell
$nonce = (Invoke-RestMethod 'http://127.0.0.1:3210/api/security/nonce').nonce
$h = @{ 'X-Local-Nonce' = $nonce }
# 1. 资产搜索（GET /api/asset/search）
Invoke-RestMethod 'http://127.0.0.1:3210/api/asset/search?keyword=%E8%8C%85%E5%8F%B0' | ConvertTo-Json -Depth 3
# 2. 分红预告（GET /api/dividend/upcoming）
Invoke-RestMethod 'http://127.0.0.1:3210/api/dividend/upcoming' | ConvertTo-Json -Depth 3
# 3. 自选列表（GET /api/watchlist）
Invoke-RestMethod 'http://127.0.0.1:3210/api/watchlist' | ConvertTo-Json -Depth 3
# 4. 设置（GET /api/settings）
Invoke-RestMethod 'http://127.0.0.1:3210/api/settings' | ConvertTo-Json -Depth 3
```

Expected: 4 个端点均返回 200 与合理结构（search 返回 items、upcoming 返回数组、watchlist 返回 entries、settings 返回对象）。若有 404，说明文档清单与代码不符 → 修正 `docs/HTTP-API.md` 后重新提交。

- [ ] **Step 5: 浏览器加载前端**

用 chrome-devtools 工具（chrome-devtools_list_pages / new_page）打开 `http://localhost:5173`（electron-vite dev 的渲染进程地址，可在 `.runtime-data` 或 dev 输出中确认；若不可用则跳过本步并在 D1 统一验收）。确认页面渲染、控制台无 `X-Local-Nonce` 相关报错。

- [ ] **Step 6: 清理**

`Stop-Job $job; Remove-Job $job`。若 B1 已验证自定义端口，本任务只需默认端口。

- [ ] **Step 7: 提交（如有文档修正）**

```bash
git add docs/HTTP-API.md
git commit -m "docs(http): 按端到端验收修正路由清单"
```

（无修正则跳过本步骤。）

---

# Phase C：页面状态组件

## Task C1: useFetch hook

**Files:**
- Create: `src/renderer/src/hooks/useFetch.ts`

**Interfaces:**
- Produces:

```ts
export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  options?: { rethrow?: boolean; initialLoading?: boolean }
): {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  setData: React.Dispatch<React.SetStateAction<T | null>>
}
```

`rethrow` 默认 `true`（与 useWatchlist 现状一致）；`initialLoading` 默认 `true`。`reload` 用 ref 持有最新 fetcher，effect 依赖 `[reload, ...deps]`，组件卸载后不 setState。

- [ ] **Step 1: 实现**

创建 `src/renderer/src/hooks/useFetch.ts`：

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DependencyList, Dispatch, SetStateAction } from 'react'

type UseFetchOptions = {
  rethrow?: boolean
  initialLoading?: boolean
}

export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  options: UseFetchOptions = {}
) {
  const { rethrow = true, initialLoading = true } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(initialLoading)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reload = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }

    try {
      const result = await fetcherRef.current()
      if (mountedRef.current) {
        setData(result)
      }
    } catch (loadError) {
      if (mountedRef.current) {
        setError(loadError instanceof Error ? loadError.message : '请求失败')
      }
      if (rethrow) {
        throw loadError
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [rethrow])

  useEffect(() => {
    mountedRef.current = true
    void reload().catch(() => {})

    return () => {
      mountedRef.current = false
    }
    // reload 稳定（仅依赖 rethrow），deps 变化触发重载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps])

  return { data, loading, error, reload, setData }
}

export type UseFetchReturn<T> = ReturnType<typeof useFetch<T>>
```

- [ ] **Step 2: 验证编译**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/hooks/useFetch.ts
git commit -m "feat(hooks): 新增 useFetch 通用请求 hook"
```

---

## Task C2: 迁移简单型 hooks（6 个）

**Files:**
- Modify: `src/renderer/src/hooks/useAssetDetail.ts`
- Modify: `src/renderer/src/hooks/useStockDetail.ts`
- Modify: `src/renderer/src/hooks/useBacktest.ts`
- Modify: `src/renderer/src/hooks/useComparison.ts`
- Modify: `src/renderer/src/hooks/useAssetComparison.ts`
- Modify: `src/renderer/src/hooks/useAssetBacktest.ts`

**Interfaces:**
- Consumes: `useFetch`（Task C1）
- Produces: 各 hook 对外返回结构不变（`{ data, loading, error }` 等）

- [ ] **Step 1: useAssetDetail.ts 整体替换**

```ts
import { useMemo } from 'react'
import type { AssetDetailDto, AssetQueryDto } from '@shared/contracts/api'
import { assetApi } from '@renderer/services/assetApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useAssetDetail(request: AssetQueryDto | null) {
  const requestKey = useMemo(() => JSON.stringify(request ?? {}), [request])

  const { data, loading, error } = useFetch<AssetDetailDto | null>(
    async () => {
      if (!request) {
        return null
      }
      return assetApi.getDetail(request)
    },
    [requestKey, request]
  )

  return { data, loading, error }
}
```

- [ ] **Step 2: useStockDetail.ts 整体替换**

```ts
import type { StockDetailDto } from '@shared/contracts/api'
import { stockApi } from '@renderer/services/stockApi'
import { useFetch } from '@renderer/hooks/useFetch'

function isAShareSymbol(symbol: string) {
  return /^(6|0|3)\d{5}$/.test(symbol.trim())
}

export function useStockDetail(symbol: string) {
  const { data, loading, error } = useFetch<StockDetailDto | null>(
    async () => {
      if (!isAShareSymbol(symbol)) {
        throw new Error(`仅支持A股6位代码，当前代码无效：${symbol}`)
      }
      return stockApi.getDetail(symbol)
    },
    [symbol]
  )

  return { data, loading, error }
}
```

- [ ] **Step 3: useBacktest.ts 整体替换**

```ts
import type { BacktestResultDto } from '@shared/contracts/api'
import { calculationApi } from '@renderer/services/calculationApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useBacktest(symbol: string, buyDate: string) {
  const { data, loading, error } = useFetch<BacktestResultDto>(
    () => calculationApi.runDividendReinvestmentBacktest(symbol, buyDate),
    [symbol, buyDate]
  )

  return { data, loading, error }
}
```

- [ ] **Step 4: useComparison.ts 整体替换**

```ts
import { useMemo } from 'react'
import type { ComparisonRowDto } from '@shared/contracts/api'
import { stockApi } from '@renderer/services/stockApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useComparison(symbols: string[]) {
  const requestKey = useMemo(() => symbols.join('|'), [symbols])

  const { data, loading, error } = useFetch<ComparisonRowDto[]>(
    () => stockApi.compare(symbols),
    [requestKey, symbols]
  )

  return { data, loading, error }
}
```

- [ ] **Step 5: useAssetComparison.ts 整体替换**

```ts
import { useMemo } from 'react'
import type { AssetComparisonRowDto } from '@shared/contracts/api'
import { assetApi } from '@renderer/services/assetApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useAssetComparison(assetKeys: string[]) {
  const normalized = useMemo(() => assetKeys.filter((item) => item.trim().length > 0), [assetKeys])
  const requestKey = normalized.join('|')

  const { data, loading, error } = useFetch<AssetComparisonRowDto[]>(
    () =>
      assetApi.compare({
        items: normalized.map((assetKey) => ({ assetKey }))
      }),
    [requestKey, normalized]
  )

  return { data, loading, error }
}
```

- [ ] **Step 6: useAssetBacktest.ts 整体替换**

```ts
import type { AssetBacktestRequestDto, BacktestResultDto } from '@shared/contracts/api'
import { calculationApi } from '@renderer/services/calculationApi'
import { useFetch } from '@renderer/hooks/useFetch'

export type BacktestParams = {
  assetKey: string | null
  buyDate: string
  initialCapital?: number
  includeFees?: boolean
  feeRate?: number
  stampDutyRate?: number
  minCommission?: number
  dcaEnabled?: boolean
  dcaFrequency?: 'monthly' | 'quarterly' | 'yearly'
  dcaAmount?: number
  benchmarkSymbol?: string
}

export function useAssetBacktest(params: BacktestParams) {
  const { data, loading, error } = useFetch<BacktestResultDto | null>(
    async () => {
      if (!params.assetKey) {
        return null
      }

      const request: AssetBacktestRequestDto = {
        asset: { assetKey: params.assetKey },
        buyDate: params.buyDate,
        initialCapital: params.initialCapital,
        includeFees: params.includeFees,
        feeRate: params.feeRate,
        stampDutyRate: params.stampDutyRate,
        minCommission: params.minCommission,
        benchmarkSymbol: params.benchmarkSymbol || undefined
      }

      if (params.dcaEnabled && params.dcaAmount && params.dcaFrequency) {
        request.dcaConfig = {
          enabled: true,
          frequency: params.dcaFrequency,
          amount: params.dcaAmount
        }
      }

      return calculationApi.runDividendReinvestmentBacktestForAsset(request)
    },
    [
      params.assetKey,
      params.buyDate,
      params.initialCapital,
      params.includeFees,
      params.feeRate,
      params.stampDutyRate,
      params.minCommission,
      params.dcaEnabled,
      params.dcaFrequency,
      params.dcaAmount,
      params.benchmarkSymbol
    ]
  )

  return { data, loading, error }
}
```

- [ ] **Step 7: 验证 + 提交**

Run: `npm run typecheck`
Expected: 无错误（若某页面调用方用了 `reload` 之外的字段，以 typecheck 报错为准调整）

Run: `npx vitest run`
Expected: 全部 PASS

```bash
git add src/renderer/src/hooks/useAssetDetail.ts src/renderer/src/hooks/useStockDetail.ts src/renderer/src/hooks/useBacktest.ts src/renderer/src/hooks/useComparison.ts src/renderer/src/hooks/useAssetComparison.ts src/renderer/src/hooks/useAssetBacktest.ts
git commit -m "refactor(hooks): 六个简单请求 hook 迁移到 useFetch"
```

---

## Task C3: 迁移带 mutation 的 hooks（4 个）

**Files:**
- Modify: `src/renderer/src/hooks/useSettings.ts`
- Modify: `src/renderer/src/hooks/useWatchlist.ts`
- Modify: `src/renderer/src/hooks/useWatchlistGroups.ts`
- Modify: `src/renderer/src/hooks/useIndustryAnalysis.ts`

**Interfaces:**
- Consumes: `useFetch`（Task C1）
- Produces: 各 hook 对外返回结构不变（`useSettings` 含 `saving/save/reset`；`useWatchlist` 含 `mutatingAssetKey` 与 mutation 方法；`useWatchlistGroups` 含 `groups` 与分组方法；`useIndustryAnalysis` 含 `data/distribution`）

- [ ] **Step 1: useSettings.ts 整体替换**

```ts
import { useState } from 'react'
import type { SettingsDto } from '@shared/contracts/api'
import { fetchSettings, updateSettings, resetSettings } from '@renderer/services/settingsApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useSettings() {
  const { data: settings, loading, error, reload, setData } = useFetch<SettingsDto | null>(
    async () => {
      const value = await fetchSettings()
      return value ?? null
    },
    [],
    { rethrow: false }
  )
  const [saving, setSaving] = useState(false)

  const save = async (partial: Record<string, unknown>) => {
    setSaving(true)
    try {
      const updated = await updateSettings(partial)
      setData(updated)
      return updated
    } catch (err) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    setSaving(true)
    try {
      const resetValue = await resetSettings()
      setData(resetValue)
      return resetValue
    } catch (err) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  return { settings, loading, error, saving, save, reset, reload }
}
```

注意：原实现中 `save/reset` 会把错误同时写入 `error` 状态；`useFetch` 的 error 只由 reload 管理。为保持页面行为（SettingsPage 保存失败时页面如何展示），实现后检查 `SettingsPage.tsx` 的 `save`/`reset` 调用处：若页面依赖 hook 的 `error` 显示保存失败，则在此处 `catch (err)` 内调用 `reload()` 或保留局部 error 状态（以 typecheck 与页面行为为准，页面侧有 `message.error` 兜底即可接受）。

- [ ] **Step 2: useWatchlist.ts 整体替换**

```ts
import { useCallback, useState } from 'react'
import type { AssetQueryDto, WatchlistEntryDto } from '@shared/contracts/api'
import { watchlistApi } from '@renderer/services/watchlistApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useWatchlist() {
  const { data, loading, error, reload } = useFetch<WatchlistEntryDto[]>(() => watchlistApi.list(), [])
  const [mutatingAssetKey, setMutatingAssetKey] = useState<string | null>(null)

  const withMutation = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setMutatingAssetKey(key)
      try {
        await action()
        await reload()
      } finally {
        setMutatingAssetKey(null)
      }
    },
    [reload]
  )

  const add = useCallback(
    async (symbol: string) => {
      await withMutation(symbol, () => watchlistApi.add(symbol))
    },
    [withMutation]
  )

  const remove = useCallback(
    async (symbol: string) => {
      await withMutation(symbol, () => watchlistApi.remove(symbol))
    },
    [withMutation]
  )

  const addAsset = useCallback(
    async (request: AssetQueryDto) => {
      const mutatingKey = request.assetKey ?? request.code ?? request.symbol ?? ''
      await withMutation(mutatingKey, () => watchlistApi.addAsset(request))
    },
    [withMutation]
  )

  const removeAsset = useCallback(
    async (assetKey: string) => {
      await withMutation(assetKey, () => watchlistApi.removeAsset(assetKey))
    },
    [withMutation]
  )

  return { data, loading, error, reload, add, remove, addAsset, removeAsset, mutatingAssetKey }
}
```

注意：原 `add/remove/addAsset/removeAsset` 在失败时不重新抛出（仅 `finally` 复位），且 mutation 前会 `setError(null)`。`useFetch` 的 `reload` 默认 rethrow，`withMutation` 内 `await reload()` 抛错时 mutation 方法会 reject → 检查各页面调用处（`WatchlistPage` 等）是否已 try/catch；若有未捕获的 reject 风险，将 `await reload()` 改为 `await reload().catch(() => {})` 保持原"吞错"语义。

- [ ] **Step 3: useWatchlistGroups.ts 整体替换**

```ts
import { useCallback } from 'react'
import type { WatchlistGroupDto, WatchlistGroupUpsertDto } from '@shared/contracts/api'
import { watchlistApi } from '@renderer/services/watchlistApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useWatchlistGroups() {
  const { data: groups, loading, error, reload } = useFetch<WatchlistGroupDto[]>(() => watchlistApi.listGroups(), [])

  const createGroup = useCallback(
    async (request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> => {
      const group = await watchlistApi.createGroup(request)
      await reload().catch(() => {})
      return group
    },
    [reload]
  )

  const updateGroup = useCallback(
    async (id: string, request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> => {
      const group = await watchlistApi.updateGroup(id, request)
      await reload().catch(() => {})
      return group
    },
    [reload]
  )

  const deleteGroup = useCallback(
    async (id: string): Promise<void> => {
      await watchlistApi.deleteGroup(id)
      await reload().catch(() => {})
    },
    [reload]
  )

  const addToGroup = useCallback(
    async (groupId: string, assetKey: string): Promise<void> => {
      await watchlistApi.addToGroup({ groupId, assetKey })
      await reload().catch(() => {})
    },
    [reload]
  )

  const removeFromGroup = useCallback(
    async (groupId: string, assetKey: string): Promise<void> => {
      await watchlistApi.removeFromGroup({ groupId, assetKey })
      await reload().catch(() => {})
    },
    [reload]
  )

  return { groups, loading, error, reload, createGroup, updateGroup, deleteGroup, addToGroup, removeFromGroup }
}
```

- [ ] **Step 4: useIndustryAnalysis.ts 整体替换**

```ts
import type { IndustryAnalysisDto, IndustryDistributionItemDto } from '@shared/contracts/api'
import { getIndustryDesktopApi } from '@renderer/services/desktopApi'
import { useFetch } from '@renderer/hooks/useFetch'

type IndustryData = [IndustryAnalysisDto[], IndustryDistributionItemDto[]]

export function useIndustryAnalysis() {
  const { data, loading, error } = useFetch<IndustryData>(
    async () => {
      const api = getIndustryDesktopApi()
      return Promise.all([api.getAnalysis(), api.getDistribution()])
    },
    []
  )

  return {
    data: data?.[0] ?? [],
    distribution: data?.[1] ?? [],
    loading,
    error
  }
}

export function useIndustryBenchmark(industryName: string | undefined) {
  // 独立小 hook：无 loading/error 三态，保持原实现（见原文件 46-73 行）
}
```

`useIndustryBenchmark` 保持原实现不变（复制原代码）。

- [ ] **Step 5: 验证 + 提交**

Run: `npm run typecheck`
Expected: 无错误

Run: `npx vitest run`
Expected: 全部 PASS

```bash
git add src/renderer/src/hooks/useSettings.ts src/renderer/src/hooks/useWatchlist.ts src/renderer/src/hooks/useWatchlistGroups.ts src/renderer/src/hooks/useIndustryAnalysis.ts
git commit -m "refactor(hooks): 四个带 mutation 的 hook 迁移到 useFetch"
```

---

## Task C4: PageState 三态组件

**Files:**
- Create: `src/renderer/src/components/app/PageState.tsx`

**Interfaces:**
- Consumes: `PageStateBlock`（现有）
- Produces:

```tsx
export function PageState(props: {
  loading: boolean
  error?: string | null
  empty?: boolean
  skeletonRows?: number
  emptyTitle?: string
  emptyDescription?: string
  errorTitle?: string
  children?: React.ReactNode
}): JSX.Element
```

`empty` 判定与文案由调用方传入；`error` 展示 Alert（showIcon）；多空态页面在 `children` 内自行使用 `PageStateBlock`。

- [ ] **Step 1: 实现**

创建 `src/renderer/src/components/app/PageState.tsx`：

```tsx
import type { ReactNode } from 'react'
import { Alert, Skeleton } from 'antd'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'

type PageStateProps = {
  loading: boolean
  error?: string | null
  empty?: boolean
  skeletonRows?: number
  emptyTitle?: string
  emptyDescription?: string
  errorTitle?: string
  children?: ReactNode
}

export function PageState({
  loading,
  error,
  empty,
  skeletonRows = 6,
  emptyTitle,
  emptyDescription,
  errorTitle = '加载失败',
  children
}: PageStateProps) {
  if (loading) {
    return <Skeleton active paragraph={{ rows: skeletonRows }} />
  }

  if (error) {
    return <Alert type="error" showIcon message={errorTitle} description={error} />
  }

  if (empty) {
    return <PageStateBlock kind="no-data" title={emptyTitle} description={emptyDescription} />
  }

  return <>{children}</>
}
```

- [ ] **Step 2: 验证编译**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/app/PageState.tsx
git commit -m "feat(ui): 新增 PageState 三态页面组件"
```

---

## Task C5: 迁移页面批 1（4 页）

**Files:**
- Modify: `src/renderer/src/pages/WatchlistPage.tsx`
- Modify: `src/renderer/src/pages/StockDetailPage.tsx`
- Modify: `src/renderer/src/pages/ComparisonPage.tsx`
- Modify: `src/renderer/src/pages/BacktestPage.tsx`

**Interfaces:**
- Consumes: `PageState`（Task C4）

- [ ] **Step 1: WatchlistPage 三态替换**

`src/renderer/src/pages/WatchlistPage.tsx`：

- 将 `if (loading && data.length === 0) { return <Skeleton active paragraph={{ rows: 6 }} /> }` 与 `if (error) { return <Alert type="error" message={error} /> }` 两段删除
- 将 `return (` 改为用 `PageState` 包裹（loading 条件保持"首载且空"语义、error 同前）：

```tsx
  return (
    <PageState loading={loading && data.length === 0} error={error}>
      <div className="ledger-page">
        {messageHolder}
        <section className="ledger-watchlist-header">…（原内容不变）…</section>
        …（其余原内容不变，缩进整体 +2）…
      </div>
    </PageState>
  )
```

- 若该页 import 的 `Skeleton` 仅用于此三态处，则从 antd import 中移除 `Skeleton`；`Alert` 若仅此一处同样移除（以 typecheck 的 unused 提示为准，strict 未开启 noUnusedLocals 则保留亦可，但按整洁原则移除）

- [ ] **Step 2: StockDetailPage 三态替换**

`src/renderer/src/pages/StockDetailPage.tsx`：

- 删除三处早退（`loading` 的 Skeleton、`error` 的 Alert、`!data` 的 PageStateBlock），保留 `!assetKey.trim()` 的"还没有选择资产"空态与 `!isPreciousMetal && …` 的"暂无历史现金分配数据"空态（它们在 `data` 可用后判断，属 children 内空态）
- 将后续 `return (` 改为：

```tsx
  return (
    <PageState loading={loading} error={error}>
      {!assetKey.trim() ? (
        <PageStateBlock
          kind="empty"
          title="还没有选择资产"
          description="请先从概览页或自选页进入资产详情。"
        />
      ) : !data ? (
        <PageStateBlock
          kind="no-data"
          title="该资产暂无详情数据"
          description="当前未返回可展示的详情信息，可稍后重试或更换资产代码。"
        />
      ) : (
        <div className="ledger-page">…（原详情内容，缩进整体 +2）…</div>
      )}
    </PageState>
  )
```

- 删除不再使用的 import（`Skeleton`、`Alert`、按需保留 `PageStateBlock`）

- [ ] **Step 3: ComparisonPage 三态替换**

`src/renderer/src/pages/ComparisonPage.tsx`：

- 删除 `loading` 早退（Skeleton）与 `error` 早退（Alert）
- 保留两个空态判断（`assetKeys.length === 0` 与 `data.length === 0`），将 `return (` 改为：

```tsx
  return (
    <PageState loading={loading} error={error}>
      {assetKeys.length === 0 ? (
        <PageStateBlock
          kind="empty"
          title="还没有选择对比标的"
          description="请从自选页或搜索入口先添加至少 1 只资产，再进入对比页。"
        />
      ) : data.length === 0 ? (
        <PageStateBlock
          kind="no-data"
          title="当前标的暂无可对比数据"
          description="可尝试更换股票代码，或稍后重试以等待数据同步。"
        />
      ) : (
        <div className="ledger-page">…（原对比内容，缩进整体 +2）…</div>
      )}
    </PageState>
  )
```

- [ ] **Step 4: BacktestPage 三态替换**

`src/renderer/src/pages/BacktestPage.tsx`：

- 删除并列的 `{loading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}` 与 `{!loading && error ? <Alert type="error" message={error} /> : null}`
- 将结果区整体包一层：

```tsx
      <PageState loading={loading} error={error}>
        {!primaryAssetKey.trim() ? (
          <PageStateBlock kind="empty" title="还没有选择回测标的" description="请先进入某个资产详情页，再发起回测。" />
        ) : !data ? (
          <PageStateBlock kind="no-data" title="当前条件暂无回测结果" description="系统未返回可展示的回测数据，请调整条件后重试。" />
        ) : (
          <>
            {isMulti && multiResults.length >= 2 ? <BacktestMultiCompare results={multiResults} /> : null}
            …（其余原结果区内容，缩进整体 +2）…
          </>
        )}
      </PageState>
```

注意：BacktestPage 原逻辑中空态/结果区各自带 `!loading && !error` 前缀判断，替换后由 `PageState` 的早退保证（loading/error 时不渲染 children），children 内判断可去掉这些前缀。

- [ ] **Step 5: 验证 + 提交**

Run: `npm run typecheck`
Expected: 无错误（unused import 若报错则移除；页面渲染行为不改变）

```bash
git add src/renderer/src/pages/WatchlistPage.tsx src/renderer/src/pages/StockDetailPage.tsx src/renderer/src/pages/ComparisonPage.tsx src/renderer/src/pages/BacktestPage.tsx
git commit -m "refactor(ui): 四个页面迁移到 PageState 三态组件"
```

---

## Task C6: 迁移页面批 2（3 页）

**Files:**
- Modify: `src/renderer/src/pages/BacktestHistoryPage.tsx`
- Modify: `src/renderer/src/pages/IndustryAnalysisPage.tsx`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `PageState`（Task C4）、`useFetch`（Task C1）

- [ ] **Step 1: BacktestHistoryPage 整体替换**

将 `src/renderer/src/pages/BacktestHistoryPage.tsx` 替换为（页面内联样板迁移到 useFetch）：

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Popconfirm, message, Empty, Button } from 'antd'
import type { BacktestResultDto } from '@shared/contracts/api'
import { getBacktestDesktopApi } from '@renderer/services/desktopApi'
import { useFetch } from '@renderer/hooks/useFetch'
import { PageState } from '@renderer/components/app/PageState'

type HistoryItem = {
  id: string
  name: string
  assetKey: string
  buyDate: string
  dcaConfig: string | null
  result: BacktestResultDto
  createdAt: string
}

const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function BacktestHistoryPage() {
  const navigate = useNavigate()
  const { data: items, loading, error, reload, setData } = useFetch<HistoryItem[]>(async () => {
    const api = getBacktestDesktopApi()
    return api.historyList()
  }, [])

  async function handleDelete(id: string) {
    try {
      const api = getBacktestDesktopApi()
      await api.historyDelete(id)
      void message.success('已删除')
      setData((prev) => (prev ?? []).filter((item) => item.id !== id))
    } catch {
      void message.error('删除失败')
    }
  }

  useEffect(() => {
    void reload().catch(() => {})
  }, [reload])

  return (
    <div className="ledger-page">
      <PageState loading={loading} error={error}>
        <section className="ledger-watchlist-header">
          <div className="ledger-watchlist-copy">
            <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>回测历史</h1>
            <p className="ledger-hero-subtitle">已保存的回测结果，支持查看和删除。</p>
          </div>
        </section>

        {items.length === 0 ? (
          <div className="ledger-toolbar-card" style={{ textAlign: 'center', padding: 48 }}>
            <Empty description="暂无保存的回测记录">
              <Button type="primary" onClick={() => navigate('/backtest')}>
                前往回测
              </Button>
            </Empty>
          </div>
        ) : (
          …（原表格区内容，缩进整体 +2）…
        )}
      </PageState>
    </div>
  )
}
```

（原文件 90 行起的表格内容保持不变，仅调整缩进；删除 `Skeleton`/`Alert` import。）

- [ ] **Step 2: IndustryAnalysisPage 三态替换**

`src/renderer/src/pages/IndustryAnalysisPage.tsx`：

- 删除 `if (loading) return …Skeleton…` 与 `if (error) return …Alert…` 两段
- 将 `return (` 改为：

```tsx
  return (
    <PageState loading={loading} error={error} skeletonRows={12}>
      <div style={{ padding: 24 }}>
        …（原内容不变，缩进整体 +2）…
      </div>
    </PageState>
  )
```

（注意：原页面无 `.ledger-page` 包装，`PageState` 直接包住原内容即可。）

- [ ] **Step 3: SettingsPage 三态替换**

`src/renderer/src/pages/SettingsPage.tsx`：

- 删除 `loading`/`error`/`!local` 三个早退块（`!local` 的"无法加载设置"空态块一并删除）
- 将 `return (` 改为：

```tsx
  return (
    <div className="ledger-page">
      <PageState loading={loading} error={error}>
        {!local ? (
          <div className="page-state-block">
            <p className="page-state-title">无法加载设置</p>
            <p className="page-state-description">请稍后重试。</p>
          </div>
        ) : (
          …（原设置内容，缩进整体 +2）…
        )}
      </PageState>
    </div>
  )
```

- [ ] **Step 4: 验证 + 提交**

Run: `npm run typecheck`
Expected: 无错误

```bash
git add src/renderer/src/pages/BacktestHistoryPage.tsx src/renderer/src/pages/IndustryAnalysisPage.tsx src/renderer/src/pages/SettingsPage.tsx
git commit -m "refactor(ui): 三个页面迁移到 PageState 与 useFetch"
```

---

## Task C7: 前端端到端 MCP 验收

**Files:**
- 无代码改动（验收任务）

**Prerequisites:** Phase C 全部任务完成。

- [ ] **Step 1: 启动浏览器预览**

```powershell
$job = Start-Job -ScriptBlock {
  Set-Location 'I:\code\DividendMonitor'
  $env:DIVIDEND_MONITOR_HEADLESS = '1'
  npx electron-vite dev 2>&1 | Out-File -FilePath 'C:\Users\15845\AppData\Local\Temp\opencode\e2e-frontend.log' -Encoding utf8
}
```

用 chrome-devtools 工具打开 `http://localhost:5173`（electron-vite dev 的渲染进程地址，可从 dev 输出确认）。

- [ ] **Step 2: 正常态遍历 9 个页面**

依次访问（用 chrome-devtools_navigate_page / take_snapshot）：
1. `/` 工作台（Dashboard）— 搜索"贵州茅台"，进入详情
2. 详情页 — 估值/股息率区域正常
3. `/watchlist` 自选 — 列表渲染（若空则添加一只资产后重进）
4. 对比页（从详情页"加入对比"或手填 URL `/#/compare`）
5. 回测页（从详情页进入）— 选日期后出结果
6. `/backtest-history` 回测历史 — 列表或空态正常
7. `/industry-analysis` 行业分析 — 正常或空态
8. `/settings` 设置 — 表单渲染
9. `/dividend-center` 分红中心 — 汇总/图表/即将到账正常

每页通过标准：无白屏、无未捕获异常（chrome-devtools_list_console_messages 无 error 级消息）、三态区域渲染正常。

- [ ] **Step 3: 错误态验证**

用 chrome-devtools_emulate 将网络设为 `Offline`，刷新详情页 → 应显示统一 error Alert（showIcon，标题"加载失败"），无白屏。恢复网络。

- [ ] **Step 4: 空态验证**

- 清空自选后访问 `/watchlist`（或新用户视角）→ 表格/空态正常
- 无回测历史时访问 `/backtest-history` → "暂无保存的回测记录" Empty + 按钮

- [ ] **Step 5: 加载态验证**

用 chrome-devtools_emulate 设 `Fast 3G`，刷新详情页 → 首屏显示 Skeleton（PageState loading 形态）。恢复后关闭节流。

- [ ] **Step 6: 回归确认 + 清理**

`Stop-Job $job; Remove-Job $job`。

---

# Phase D：最终验收

## Task D1: 全量回归 + 缓存端到端（MCP）

**Files:**
- 无代码改动（验收任务）

- [ ] **Step 1: 静态与单测**

Run: `npm run typecheck` → Expected: 无错误
Run: `npm test` → Expected: 全部 PASS

- [ ] **Step 2: 缓存落盘验证（SQLite）**

启动 headless 运行时（后台 job，日志 `e2e-cache.log`），用 chrome-devtools 打开前端：

1. 浏览器搜索"贵州茅台"（600519）并进入详情页 → 等待估值显示
2. 停止 job 前，直接查询 SQLite 确认 `valuation_cache` 有 600519 行：

```powershell
# 在 headless job 运行期间（或停止后）：
$dbPath = Join-Path $env:APPDATA 'shou-xi-lao\db\dividend-monitor.sqlite'
# 若 userData 目录名不同，从 src/main/infrastructure/db/sqlite.ts 的 app.getPath('userData') 推导，或查 %APPDATA% 下目录
```

（SQLite 查询可用 `npx` 无 sqlite3 CLI 时跳过直接 DB 检查，改由行为验证替代：见 Step 3。）

- [ ] **Step 3: 缓存命中行为验证（网络面板）**

1. 详情页估值显示后，刷新页面再进详情页 → 用 chrome-devtools_list_network_requests 检查：估值相关请求（`/api/asset/detail` 之外）不再重复触发（估值数据来自 SQLite + 内存回填）
2. **重启场景**：停止 job → 重新启动 job → 再次进入详情页 → 估值仍显示（SQLite 恢复），且网络面板无估值数据源直连请求（命中 `valuation_cache`）

通过标准：重启后估值正常显示且无估值源请求。

- [ ] **Step 4: HTTP API 文档最终核对**

对 `docs/HTTP-API.md` 路由清单抽样 3 个端点实际请求（nonce + `/api/asset/search` + `/api/dividend/upcoming`），确认与文档一致（B3 已做过，此处仅抽查确认）。

- [ ] **Step 5: 清理与提交（如有遗留修正）**

`Stop-Job $job; Remove-Job $job`（如未清理）。如有任何代码修正，按任务对应方式提交；无修正则仅确认。

---

# Self-Review 记录（计划编写时完成）

**Spec 覆盖核对：**
- §2.1 端口可配置 → Task B1 ✓
- §2.2 文档 → Task B2 ✓
- §3.1 TimedCache → Task A1 ✓
- §3.2 valuation_cache 表 → Task A2 ✓
- §3.3 仓库改造 → Task A3、A4 ✓
- §4.1 useFetch + 10 hooks → Task C1、C2、C3 ✓
- §4.2 PageState + 7 页面 → Task C4、C5、C6 ✓
- §5 测试策略 → 各任务内 TDD 步骤 + D1 ✓
- §6 端到端 MCP 验收 → Task B3、C7、D1 ✓
- §7 非目标 → 所有任务均不触碰（未改 SourceGateway、未迁移 usePortfolio/usePortfolioRiskMetrics、未清理 useStockDetail 合并、未新增 jsdom）✓

**类型一致性核对：**
- `TimedCache.getFresh` 返回 `{ value: V } | undefined`：Task A1 定义，A3/A4 消费（`memoryHit.value`）✓
- `ValuationCacheRepository.upsert/findByKey/findFreshByKey`：Task A2 定义，A3/A4 消费（`diskCache.findFreshByKey<StockValuationSource>(symbol, VALUATION_CACHE_TTL_MS)`）✓
- `useFetch` 返回 `{ data, loading, error, reload, setData }`：Task C1 定义，C2/C3 消费（C3 的 useSettings 用 `data: settings` 重命名 + `setData`；useWatchlist 用 `data` + `reload`）✓
- `PageState` props（loading/error/empty/skeletonRows/emptyTitle/emptyDescription/errorTitle/children）：Task C4 定义，C5/C6 消费 ✓

**已知风险与执行说明（不影响任务顺序）：**
- Task C3 Step 1 的 useSettings：`save/reset` 不再写入 hook 的 `error` 状态，需检查 SettingsPage 调用处（实现时以 typecheck 与页面行为为准，页面有 `message.error` 兜底即可）
- Task C3 Step 2 的 useWatchlist：mutation 后 `reload` rethrow 可能影响页面调用处，实现时若页面无 try/catch 则改为 `.catch(() => {})` 保持原语义
- Task D1 Step 2 的 SQLite 直接查询：若无法定位 userData 目录或不便执行，以 Step 3 的行为验证替代
