import { createNodeSqliteDatabase } from '@main/infrastructure/db/nodeSqliteDatabase'
import type { SqliteDatabase } from '@main/infrastructure/db/databaseTypes'
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

let memoryDb: SqliteDatabase

vi.mock('@main/infrastructure/db/sqlite', () => ({
  getDatabase: () => memoryDb,
  getDatabaseFilePathForDebug: () => ':memory:'
}))

const { ValuationCacheRepository } = await import('@main/repositories/valuationCacheRepository')

describe('ValuationCacheRepository', () => {
  let repo: InstanceType<typeof ValuationCacheRepository>

  beforeEach(async () => {
    memoryDb = createNodeSqliteDatabase(new DatabaseSync(':memory:'))
    await memoryDb.exec(createValuationCacheTable)
    repo = new ValuationCacheRepository()
  })

  describe('upsert', () => {
    it('inserts a new entry', async () => {
      await repo.upsert('600519', JSON.stringify({ pe: { currentValue: 30 } }))

      const row = (await memoryDb
        .prepare('SELECT * FROM valuation_cache WHERE cache_key = ?')
        .get('600519')) as Record<string, string>
      expect(row).toBeTruthy()
      expect(row.fetched_at).toBeTruthy()
      expect(JSON.parse(row.data_json)).toEqual({ pe: { currentValue: 30 } })
    })

    it('replaces existing entry on duplicate key', async () => {
      await repo.upsert('600519', JSON.stringify({ v: 1 }))
      await repo.upsert('600519', JSON.stringify({ v: 2 }))

      const count = (await memoryDb
        .prepare('SELECT COUNT(*) AS c FROM valuation_cache WHERE cache_key = ?')
        .get('600519')) as { c: number }
      expect(count.c).toBe(1)
      expect((await repo.findFreshByKey<{ v: number }>('600519', 60_000))?.v).toBe(2)
    })
  })

  describe('findByKey', () => {
    it('returns undefined for a missing key', async () => {
      expect((await repo.findByKey('MISSING'))).toBeUndefined()
    })

    it('returns the row for an existing key', async () => {
      await repo.upsert('510300', '{}')

      const row = (await repo.findByKey('510300'))
      expect(row).toBeTruthy()
      expect(row!.cacheKey).toBe('510300')
      expect(row!.fetchedAt).toBeTruthy()
    })
  })

  describe('findFreshByKey', () => {
    it('returns undefined when no entry exists', async () => {
      expect((await repo.findFreshByKey('NONE', 60_000))).toBeUndefined()
    })

    it('returns parsed data for a fresh entry', async () => {
      await repo.upsert('600519', JSON.stringify({ pe: { currentValue: 30 } }))
      expect((await repo.findFreshByKey<{ pe: { currentValue: number } }>('600519', 60_000))).toEqual({
        pe: { currentValue: 30 }
      })
    })

    it('returns undefined for a stale entry', async () => {
      const old = new Date(Date.now() - 20 * 60 * 1000).toISOString()
      await memoryDb
        .prepare('INSERT INTO valuation_cache VALUES (?, ?, ?)')
        .run('600519', JSON.stringify({ v: 1 }), old)

      expect((await repo.findFreshByKey('600519', 15 * 60 * 1000))).toBeUndefined()
    })

    it('returns data within ttl', async () => {
      const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      await memoryDb
        .prepare('INSERT INTO valuation_cache VALUES (?, ?, ?)')
        .run('600519', JSON.stringify({ v: 9 }), recent)

      expect((await repo.findFreshByKey<{ v: number }>('600519', 15 * 60 * 1000))).toEqual({ v: 9 })
    })

    it('returns data just before ttl boundary (aligned with TimedCache semantics)', async () => {
      const nearBoundary = new Date(Date.now() - (15 * 60 - 5) * 1000).toISOString()
      await memoryDb
        .prepare('INSERT INTO valuation_cache VALUES (?, ?, ?)')
        .run('600519', JSON.stringify({ v: 10 }), nearBoundary)

      expect((await repo.findFreshByKey<{ v: number }>('600519', 15 * 60 * 1000))).toEqual({ v: 10 })
    })

    it('returns undefined when JSON is corrupt', async () => {
      await memoryDb
        .prepare('INSERT INTO valuation_cache VALUES (?, ?, ?)')
        .run('BAD', '{not valid json', new Date().toISOString())

      expect((await repo.findFreshByKey('BAD', 60_000))).toBeUndefined()
    })
  })
})
