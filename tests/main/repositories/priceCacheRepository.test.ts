import { createNodeSqliteDatabase } from '@main/infrastructure/db/nodeSqliteDatabase'
import type { SqliteDatabase } from '@main/infrastructure/db/databaseTypes'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createPriceCacheTable = `
  CREATE TABLE IF NOT EXISTS price_cache (
    code TEXT NOT NULL,
    date TEXT NOT NULL,
    close REAL NOT NULL,
    PRIMARY KEY (code, date)
  );
  CREATE INDEX IF NOT EXISTS idx_price_cache_code ON price_cache(code);
`

let memoryDb: SqliteDatabase

vi.mock('@main/infrastructure/db/sqlite', () => ({
  getDatabase: () => memoryDb,
  getDatabaseFilePathForDebug: () => ':memory:'
}))

const { SqlitePriceCacheRepository } = await import(
  '@main/repositories/priceCacheRepository'
)

describe('SqlitePriceCacheRepository', () => {
  let repo: InstanceType<typeof SqlitePriceCacheRepository>

  beforeEach(async () => {
    memoryDb = createNodeSqliteDatabase(new DatabaseSync(':memory:'))
    await memoryDb.exec(createPriceCacheTable)
    repo = new SqlitePriceCacheRepository()
  })

  describe('getPriceHistory', () => {
    it('returns empty array when no data cached', async () => {
      expect((await repo.getPriceHistory('601988'))).toEqual([])
    })

    it('returns prices sorted by date ascending', async () => {
      await repo.savePriceHistory('601988', [
        { date: '2020-01-03', close: 3.70 },
        { date: '2020-01-02', close: 3.65 }
      ])

      const result = (await repo.getPriceHistory('601988'))
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ date: '2020-01-02', close: 3.65 })
      expect(result[1]).toEqual({ date: '2020-01-03', close: 3.70 })
    })

    it('isolates data per code', async () => {
      await repo.savePriceHistory('601988', [{ date: '2020-01-02', close: 3.65 }])
      await repo.savePriceHistory('600519', [{ date: '2020-01-02', close: 1100 }])

      expect((await repo.getPriceHistory('601988'))).toHaveLength(1)
      expect((await repo.getPriceHistory('600519'))).toHaveLength(1)
      expect((await repo.getPriceHistory('000001'))).toEqual([])
    })
  })

  describe('savePriceHistory', () => {
    it('persists prices to the database', async () => {
      await repo.savePriceHistory('510880', [
        { date: '2020-06-15', close: 2.45 },
        { date: '2020-06-16', close: 2.48 }
      ])

      const rows = (await memoryDb
        .prepare('SELECT date, close FROM price_cache WHERE code = ? ORDER BY date ASC')
        .all('510880')) as Array<{ date: string; close: number }>

      expect(rows).toHaveLength(2)
      expect(rows[0].date).toBe('2020-06-15')
      expect(rows[1].close).toBe(2.48)
    })

    it('upserts on duplicate key (code + date)', async () => {
      await repo.savePriceHistory('601988', [{ date: '2020-01-02', close: 3.65 }])
      await repo.savePriceHistory('601988', [{ date: '2020-01-02', close: 3.99 }])

      const result = (await repo.getPriceHistory('601988'))
      expect(result).toHaveLength(1)
      expect(result[0].close).toBe(3.99)
    })

    it('handles empty input gracefully', async () => {
      await expect(repo.savePriceHistory('601988', [])).resolves.toBeUndefined()
    })

    it('handles large batch (5000 records)', async () => {
      // Generate unique dates: 2000-01-01 + offset
      const base = new Date('2000-01-01')
      const prices = Array.from({ length: 5000 }, (_, i) => {
        const d = new Date(base.getTime() + i * 86400000)
        const date = d.toISOString().slice(0, 10)
        return { date, close: 100 + i * 0.01 }
      })

      await repo.savePriceHistory('600000', prices)
      expect((await repo.getPriceHistory('600000'))).toHaveLength(5000)
    })
  })

  describe('getLatestDate', () => {
    it('returns undefined when no data', async () => {
      expect((await repo.getLatestDate('601988'))).toBeUndefined()
    })

    it('returns the latest cached date', async () => {
      await repo.savePriceHistory('601988', [
        { date: '2023-01-05', close: 3.50 },
        { date: '2025-12-31', close: 5.20 },
        { date: '2020-06-15', close: 3.10 }
      ])

      expect((await repo.getLatestDate('601988'))).toBe('2025-12-31')
    })
  })

  describe('mergeAndReturn', () => {
    it('saves and returns when cache is empty', async () => {
      const result = (await repo.mergeAndReturn('601988', [
        { date: '2020-01-02', close: 3.65 }
      ]))

      expect(result).toEqual([{ date: '2020-01-02', close: 3.65 }])
      expect((await repo.getPriceHistory('601988'))).toHaveLength(1)
    })

    it('merges new dates with existing cache', async () => {
      await repo.savePriceHistory('601988', [
        { date: '2020-01-02', close: 3.65 },
        { date: '2020-01-03', close: 3.70 }
      ])

      const result = (await repo.mergeAndReturn('601988', [
        { date: '2020-01-03', close: 3.70 }, // duplicate
        { date: '2020-01-06', close: 3.72 }  // new
      ]))

      expect(result).toHaveLength(3)
      expect(result.map((p) => p.date)).toEqual([
        '2020-01-02',
        '2020-01-03',
        '2020-01-06'
      ])
    })

    it('returns sorted by date', async () => {
      const result = (await repo.mergeAndReturn('601988', [
        { date: '2020-01-06', close: 3.72 },
        { date: '2020-01-02', close: 3.65 },
        { date: '2020-01-03', close: 3.70 }
      ]))

      expect(result.map((p) => p.date)).toEqual([
        '2020-01-02',
        '2020-01-03',
        '2020-01-06'
      ])
    })
  })
})
