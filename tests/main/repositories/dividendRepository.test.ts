import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let memoryDb: DatabaseSync

vi.mock('@main/infrastructure/db/sqlite', () => ({
  getDatabase: () => memoryDb,
  getDatabaseFilePathForDebug: () => ':memory:'
}))

const { DividendRepository } = await import('@main/repositories/dividendRepository')

function newSchema(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE dividend_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_key TEXT NOT NULL,
      year INTEGER NOT NULL,
      fiscal_year INTEGER,
      announce_date TEXT NOT NULL,
      record_date TEXT,
      ex_date TEXT,
      pay_date TEXT,
      dividend_per_share REAL NOT NULL,
      total_dividend_amount REAL,
      payout_ratio REAL,
      reference_close_price REAL NOT NULL,
      bonus_share_per10 REAL,
      transfer_share_per10 REAL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'IMPLEMENTED',
      announcement_progress TEXT,
      UNIQUE(asset_key, announce_date, fiscal_year)
    );
    CREATE INDEX IF NOT EXISTS idx_dividend_events_asset_key ON dividend_events(asset_key);
    CREATE INDEX IF NOT EXISTS idx_dividend_events_ex_date ON dividend_events(ex_date);
    CREATE INDEX IF NOT EXISTS idx_dividend_events_status ON dividend_events(status);
  `)
  return db
}

describe('DividendRepository — 预案/实施 schema', () => {
  let repo: InstanceType<typeof DividendRepository>

  beforeEach(() => {
    memoryDb = newSchema()
    repo = new DividendRepository()
  })

  it('upsertMany 预案事件能写入（status=PLANNED, ex_date=null）', () => {
    repo.upsertMany('STOCK:A_SHARE:600519', [
      {
        year: 2026,
        fiscalYear: 2025,
        announceDate: '2026-03-28',
        dividendPerShare: 0.5,
        referenceClosePrice: 1500,
        source: 'eastmoney',
        status: 'PLANNED',
        announcementProgress: '预案'
      }
    ])
    const row = memoryDb.prepare('SELECT status, announcement_progress, ex_date FROM dividend_events WHERE asset_key = ?').get('STOCK:A_SHARE:600519') as {
      status: string
      announcement_progress: string | null
      ex_date: string | null
    }
    expect(row.status).toBe('PLANNED')
    expect(row.announcement_progress).toBe('预案')
    expect(row.ex_date).toBeNull()
  })

  it('upsertMany 缺 announce_date 与 ex_date 时抛错', () => {
    expect(() =>
      repo.upsertMany('STOCK:A_SHARE:600519', [
        {
          year: 2026,
          dividendPerShare: 0.5,
          referenceClosePrice: 1500,
          source: 'eastmoney',
          status: 'PLANNED'
        }
      ])
    ).toThrowError(/missing announce_date/)
  })

  it('upsertMany 同 announce_date + fiscal_year 重复写入会 UPDATE 不重复插入', () => {
    repo.upsertMany('STOCK:A_SHARE:600519', [
      {
        year: 2026,
        fiscalYear: 2025,
        announceDate: '2026-03-28',
        exDate: '2026-04-15',
        dividendPerShare: 0.5,
        referenceClosePrice: 1500,
        source: 'eastmoney',
        status: 'PLANNED'
      }
    ])
    repo.upsertMany('STOCK:A_SHARE:600519', [
      {
        year: 2026,
        fiscalYear: 2025,
        announceDate: '2026-03-28',
        exDate: '2026-04-16',
        dividendPerShare: 0.6,
        referenceClosePrice: 1501,
        source: 'eastmoney',
        status: 'IN_PROGRESS',
        announcementProgress: '实施'
      }
    ])
    const rows = memoryDb.prepare('SELECT COUNT(*) as n, dividend_per_share, status FROM dividend_events WHERE asset_key = ?').get('STOCK:A_SHARE:600519') as any
    expect(rows.n).toBe(1)
    expect(rows.dividend_per_share).toBe(0.6)
    expect(rows.status).toBe('IN_PROGRESS')
  })

  it('listByAsset 返回带 status / announcement_progress', () => {
    repo.upsertMany('STOCK:A_SHARE:600519', [
      {
        year: 2024,
        fiscalYear: 2023,
        announceDate: '2024-06-28',
        exDate: '2024-06-29',
        dividendPerShare: 0.5,
        referenceClosePrice: 1500,
        source: 'eastmoney',
        status: 'IMPLEMENTED'
      }
    ])
    const list = repo.listByAsset('STOCK:A_SHARE:600519')
    expect(list.length).toBe(1)
    expect(list[0].status).toBe('IMPLEMENTED')
    expect(list[0].announcementProgress).toBeUndefined()
  })

  it('listUpcomingByAssetKeys 仅返回 status != IMPLEMENTED 的', () => {
    repo.upsertMany('STOCK:A_SHARE:600519', [
      {
        year: 2024,
        fiscalYear: 2023,
        announceDate: '2024-06-28',
        exDate: '2024-06-29',
        dividendPerShare: 0.5,
        referenceClosePrice: 1500,
        source: 'eastmoney',
        status: 'IMPLEMENTED'
      },
      {
        year: 2026,
        fiscalYear: 2025,
        announceDate: '2026-03-28',
        dividendPerShare: 0.6,
        referenceClosePrice: 1600,
        source: 'eastmoney',
        status: 'PLANNED',
        announcementProgress: '预案'
      }
    ])
    const upcoming = repo.listUpcomingByAssetKeys(['STOCK:A_SHARE:600519'])
    expect(upcoming.length).toBe(1)
    expect(upcoming[0].status).toBe('PLANNED')
    expect(upcoming[0].assetKey).toBe('STOCK:A_SHARE:600519')
    expect(upcoming[0].announcementProgress).toBe('预案')
  })

  it('listUpcomingByAssetKeys 空数组返回空', () => {
    expect(repo.listUpcomingByAssetKeys([])).toEqual([])
  })

  it('listUpcomingByAssetKeys sinceYear 过滤生效', () => {
    repo.upsertMany('STOCK:A_SHARE:600519', [
      {
        year: 2020,
        fiscalYear: 2019,
        announceDate: '2020-03-28',
        dividendPerShare: 0.3,
        referenceClosePrice: 800,
        source: 'eastmoney',
        status: 'PLANNED'
      },
      {
        year: 2026,
        fiscalYear: 2025,
        announceDate: '2026-03-28',
        dividendPerShare: 0.6,
        referenceClosePrice: 1600,
        source: 'eastmoney',
        status: 'PLANNED'
      }
    ])
    const upcoming = repo.listUpcomingByAssetKeys(['STOCK:A_SHARE:600519'], 2026)
    expect(upcoming.length).toBe(1)
    expect(upcoming[0].year).toBe(2026)
  })
})