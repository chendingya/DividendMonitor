import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAssetSnapshotsTable = `
  CREATE TABLE IF NOT EXISTS asset_snapshots (
    asset_key TEXT PRIMARY KEY,
    asset_type TEXT NOT NULL,
    data_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_asset_snapshots_fetched_at ON asset_snapshots(fetched_at DESC);
  CREATE INDEX IF NOT EXISTS idx_asset_snapshots_asset_type ON asset_snapshots(asset_type);
`

let memoryDb: DatabaseSync

vi.mock('@main/infrastructure/db/sqlite', () => ({
  getDatabase: () => memoryDb,
  getDatabaseFilePathForDebug: () => ':memory:'
}))

const { AssetSnapshotRepository } = await import('@main/repositories/assetSnapshotRepository')

describe('AssetSnapshotRepository', () => {
  let repo: InstanceType<typeof AssetSnapshotRepository>

  beforeEach(() => {
    memoryDb = new DatabaseSync(':memory:')
    memoryDb.exec(createAssetSnapshotsTable)
    repo = new AssetSnapshotRepository()
  })

  describe('upsert', () => {
    it('inserts a new snapshot', () => {
      repo.upsert('STOCK:A_SHARE:600519', 'STOCK', JSON.stringify({ name: '测试' }))

      const row = memoryDb
        .prepare('SELECT * FROM asset_snapshots WHERE asset_key = ?')
        .get('STOCK:A_SHARE:600519') as Record<string, string>
      expect(row).toBeTruthy()
      expect(row.asset_type).toBe('STOCK')
      expect(JSON.parse(row.data_json)).toEqual({ name: '测试' })
    })

    it('replaces an existing snapshot on duplicate key', () => {
      repo.upsert('ETF:A_SHARE:510300', 'ETF', JSON.stringify({ v: 1 }))
      repo.upsert('ETF:A_SHARE:510300', 'ETF', JSON.stringify({ v: 2 }))

      const count = memoryDb
        .prepare('SELECT COUNT(*) AS c FROM asset_snapshots WHERE asset_key = ?')
        .get('ETF:A_SHARE:510300') as { c: number }
      expect(count.c).toBe(1)
      expect(repo.findFreshByKey<{ v: number }>('ETF:A_SHARE:510300', 'ETF')?.v).toBe(2)
    })
  })

  describe('findByKey', () => {
    it('returns undefined for a missing key', () => {
      expect(repo.findByKey('MISSING:KEY:123')).toBeUndefined()
    })

    it('returns the row for an existing key', () => {
      repo.upsert('FUND:A_SHARE:009051', 'FUND', JSON.stringify({ nav: 1.2949 }))

      const row = repo.findByKey('FUND:A_SHARE:009051')
      expect(row).toBeTruthy()
      expect(row!.assetType).toBe('FUND')
      expect(row!.fetchedAt).toBeTruthy()
    })
  })

  describe('findFreshByKey', () => {
    it('returns undefined when no cache entry exists', () => {
      expect(repo.findFreshByKey('NONE:A_SHARE:000000', 'STOCK')).toBeUndefined()
    })

    it('returns parsed data for a fresh snapshot', () => {
      repo.upsert('STOCK:A_SHARE:000001', 'STOCK', JSON.stringify({ price: 12.34 }))

      const data = repo.findFreshByKey<{ price: number }>('STOCK:A_SHARE:000001', 'STOCK')
      expect(data).toEqual({ price: 12.34 })
    })

    it('returns undefined for a stale stock snapshot', () => {
      // Insert via raw SQL to backdate fetched_at
      const old = new Date(Date.now() - 20 * 60 * 1000).toISOString()
      memoryDb
        .prepare('INSERT INTO asset_snapshots VALUES (?, ?, ?, ?)')
        .run('STOCK:A_SHARE:000002', 'STOCK', JSON.stringify({ price: 99 }), old)

      expect(repo.findFreshByKey('STOCK:A_SHARE:000002', 'STOCK')).toBeUndefined()
    })

    it('returns data for a fund snapshot within 24 hours', () => {
      const recent = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
      memoryDb
        .prepare('INSERT INTO asset_snapshots VALUES (?, ?, ?, ?)')
        .run('FUND:A_SHARE:009051', 'FUND', JSON.stringify({ nav: 1.2949 }), recent)

      const data = repo.findFreshByKey<{ nav: number }>('FUND:A_SHARE:009051', 'FUND')
      expect(data).toEqual({ nav: 1.2949 })
    })

    it('returns undefined when JSON is corrupt', () => {
      memoryDb
        .prepare('INSERT INTO asset_snapshots VALUES (?, ?, ?, ?)')
        .run('STOCK:A_SHARE:BAD', 'STOCK', '{not valid json', new Date().toISOString())

      expect(repo.findFreshByKey('STOCK:A_SHARE:BAD', 'STOCK')).toBeUndefined()
    })
  })

  describe('findByKeys', () => {
    it('returns empty map for empty input', () => {
      expect(repo.findByKeys([]).size).toBe(0)
    })

    it('returns only existing keys', () => {
      repo.upsert('STOCK:A_SHARE:600519', 'STOCK', '{}')
      repo.upsert('ETF:A_SHARE:510300', 'ETF', '{}')

      const map = repo.findByKeys(['STOCK:A_SHARE:600519', 'STOCK:A_SHARE:MISSING'])
      expect(map.size).toBe(1)
      expect(map.has('STOCK:A_SHARE:600519')).toBe(true)
      expect(map.has('STOCK:A_SHARE:MISSING')).toBe(false)
    })
  })

  describe('remove', () => {
    it('deletes an existing entry', () => {
      repo.upsert('STOCK:A_SHARE:600519', 'STOCK', '{}')
      repo.remove('STOCK:A_SHARE:600519')
      expect(repo.findByKey('STOCK:A_SHARE:600519')).toBeUndefined()
    })

    it('does not throw when key does not exist', () => {
      expect(() => repo.remove('NONE:A_SHARE:000000')).not.toThrow()
    })
  })

  describe('removeOlderThan', () => {
    it('removes entries older than the given date', () => {
      const veryOld = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const recent = new Date().toISOString()

      memoryDb
        .prepare('INSERT INTO asset_snapshots VALUES (?, ?, ?, ?)')
        .run('STOCK:A_SHARE:OLD', 'STOCK', '{}', veryOld)
      memoryDb
        .prepare('INSERT INTO asset_snapshots VALUES (?, ?, ?, ?)')
        .run('STOCK:A_SHARE:NEW', 'STOCK', '{}', recent)

      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      repo.removeOlderThan(cutoff)

      expect(repo.findByKey('STOCK:A_SHARE:OLD')).toBeUndefined()
      expect(repo.findByKey('STOCK:A_SHARE:NEW')).toBeTruthy()
    })
  })
})
