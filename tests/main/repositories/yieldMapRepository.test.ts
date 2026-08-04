import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const tempDir = mkdtempSync(join(tmpdir(), 'yield-map-repo-'))
vi.mock('@main/infrastructure/db/sqlite', () => ({
  getDatabase: () => db,
  migrateYieldMapSnapshots: () => {}
}))

let db: DatabaseSync
const { YieldMapRepository } = await import('@main/repositories/yieldMapRepository')

const SAMPLE = [
  {
    assetKey: 'STOCK:A_SHARE:600519',
    symbol: '600519',
    name: '贵州茅台',
    industry: '白酒',
    price: 1450,
    yieldTtm: 0.0207,
    totalDps12m: 30
  },
  {
    assetKey: 'STOCK:A_SHARE:000001',
    symbol: '000001',
    name: '平安银行',
    industry: '银行',
    price: 10,
    yieldTtm: 0.05,
    totalDps12m: 0.5
  }
]

describe('YieldMapRepository', () => {
  beforeEach(() => {
    mkdirSync(tempDir, { recursive: true })
    db = new DatabaseSync(join(tempDir, `db-${Date.now()}.sqlite`))
    db.exec(`
      CREATE TABLE IF NOT EXISTS yield_map_snapshots (
        asset_key     TEXT PRIMARY KEY,
        symbol        TEXT NOT NULL,
        name          TEXT NOT NULL,
        industry      TEXT NOT NULL,
        price         REAL,
        yield_ttm     REAL NOT NULL,
        total_dps_12m REAL,
        fetched_at    TEXT NOT NULL
      );
    `)
  })

  afterEach(() => {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('replaceAll 全量覆盖并记录 fetched_at', () => {
    const repo = new YieldMapRepository()
    repo.replaceAll(SAMPLE)
    const rows = repo.getAll()
    expect(rows).toHaveLength(2)
    expect(rows[0].symbol).toBe('600519')
    expect(repo.getFetchedAt()).toBeTruthy()
  })

  it('replaceAll 再次调用清空旧数据', () => {
    const repo = new YieldMapRepository()
    repo.replaceAll(SAMPLE)
    repo.replaceAll([SAMPLE[0]])
    expect(repo.getAll()).toHaveLength(1)
  })

  it('空库 getAll 返回空数组、getFetchedAt 返回 null', () => {
    const repo = new YieldMapRepository()
    expect(repo.getAll()).toEqual([])
    expect(repo.getFetchedAt()).toBeNull()
  })
})
