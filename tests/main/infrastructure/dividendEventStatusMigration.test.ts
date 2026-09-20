import { createNodeSqliteDatabase } from '@main/infrastructure/db/nodeSqliteDatabase'
import type { SqliteDatabase } from '@main/infrastructure/db/databaseTypes'
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { migrateDividendEventStatus } from '@main/infrastructure/db/migrations/dividendEventStatusMigration'

describe('migrateDividendEventStatus', () => {
  async function buildLegacySchema() {
    const db = createNodeSqliteDatabase(new DatabaseSync(':memory:'))
    await db.exec(`
      CREATE TABLE dividend_events (
        asset_key TEXT NOT NULL,
        year INTEGER NOT NULL,
        fiscal_year INTEGER,
        announce_date TEXT,
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
        PRIMARY KEY (asset_key, ex_date)
      );
    `)
    return db
  }

  it('迁移加 status / announcement_progress 列并搬数据', async () => {
    const db = (await buildLegacySchema())
    await db.prepare(`INSERT INTO dividend_events (asset_key, year, announce_date, ex_date, dividend_per_share, reference_close_price, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('STOCK:A_SHARE:600519', 2024, '2024-07-01', '2024-07-15', 0.5, 1500, 'eastmoney', '2024-08-01T00:00:00Z')

    await migrateDividendEventStatus(db)

    const row = (await db.prepare('SELECT status, announcement_progress, announce_date FROM dividend_events WHERE asset_key = ?').get('STOCK:A_SHARE:600519')) as any
    expect(row.status).toBe('IMPLEMENTED')
    expect(row.announcement_progress).toBeNull()
    expect(row.announce_date).toBe('2024-07-01')
  })

  it('旧 announce_date 为 null 时用 ex_date 兜底填 announce_date', async () => {
    const db = (await buildLegacySchema())
    await db.prepare(`INSERT INTO dividend_events (asset_key, year, ex_date, dividend_per_share, reference_close_price, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('STOCK:A_SHARE:600519', 2023, '2023-07-15', 0.5, 1500, 'eastmoney', '2023-08-01T00:00:00Z')

    await migrateDividendEventStatus(db)

    const row = (await db.prepare('SELECT announce_date FROM dividend_events WHERE asset_key = ?').get('STOCK:A_SHARE:600519')) as any
    expect(row.announce_date).toBe('2023-07-15')
  })

  it('空库迁移不爆错（已建新表则幂等）', async () => {
    const db = createNodeSqliteDatabase(new DatabaseSync(':memory:'))
    await expect(migrateDividendEventStatus(db)).resolves.toBeUndefined()
  })

  it('二次迁移幂等', async () => {
    const db = (await buildLegacySchema())
    await db.prepare(`INSERT INTO dividend_events (asset_key, year, announce_date, ex_date, dividend_per_share, reference_close_price, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('STOCK:A_SHARE:600519', 2023, '2023-07-01', '2023-07-15', 0.5, 1500, 'eastmoney', '2023-08-01T00:00:00Z')

    await migrateDividendEventStatus(db)
    await expect(migrateDividendEventStatus(db)).resolves.toBeUndefined()

    const cnt = (await db.prepare('SELECT COUNT(*) as n FROM dividend_events').get()) as any
    expect(cnt.n).toBe(1)
  })

  it('fiscal_year 为 NULL 时迁移归一化为 year 且新列 NOT NULL', async () => {
    const db = (await buildLegacySchema())
    await db.prepare(`INSERT INTO dividend_events (asset_key, year, announce_date, ex_date, dividend_per_share, reference_close_price, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('STOCK:A_SHARE:600519', 2024, '2024-07-01', '2024-07-15', 0.5, 1500, 'eastmoney', '2024-08-01T00:00:00Z')

    await migrateDividendEventStatus(db)

    const cols = (await db.prepare('PRAGMA table_info(dividend_events)').all()) as Array<{ name: string; notnull: number }>
    const fiscalYearCol = cols.find((c) => c.name === 'fiscal_year')
    expect(fiscalYearCol?.notnull).toBe(1)

    const row = (await db.prepare('SELECT fiscal_year FROM dividend_events WHERE asset_key = ?').get('STOCK:A_SHARE:600519')) as any
    expect(row.fiscal_year).toBe(2024)
  })

  it('同公告日多行（不同 ex_date）迁移按新唯一键去重不崩溃', async () => {
    const db = (await buildLegacySchema())
    await db.prepare(`INSERT INTO dividend_events (asset_key, year, announce_date, ex_date, dividend_per_share, reference_close_price, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('STOCK:A_SHARE:600519', 2024, '2024-07-01', '2024-07-15', 0.5, 1500, 'eastmoney', '2024-08-01T00:00:00Z')
    await db.prepare(`INSERT INTO dividend_events (asset_key, year, announce_date, ex_date, dividend_per_share, reference_close_price, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('STOCK:A_SHARE:600519', 2024, '2024-07-01', '2024-08-15', 0.5, 1500, 'eastmoney', '2024-08-02T00:00:00Z')

    await expect(migrateDividendEventStatus(db)).resolves.toBeUndefined()

    const cnt = (await db.prepare('SELECT COUNT(*) as n FROM dividend_events').get()) as any
    expect(cnt.n).toBe(1)
  })

  it('同公告日多行（fiscal_year 不同）迁移时全部保留', async () => {
    const db = (await buildLegacySchema())
    await db.prepare(`INSERT INTO dividend_events (asset_key, year, announce_date, fiscal_year, ex_date, dividend_per_share, reference_close_price, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('STOCK:A_SHARE:600519', 2024, '2024-07-01', 2023, '2024-07-15', 0.5, 1500, 'eastmoney', '2024-08-01T00:00:00Z')
    await db.prepare(`INSERT INTO dividend_events (asset_key, year, announce_date, fiscal_year, ex_date, dividend_per_share, reference_close_price, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('STOCK:A_SHARE:600519', 2024, '2024-07-01', 2024, '2024-08-15', 0.5, 1500, 'eastmoney', '2024-08-02T00:00:00Z')

    await migrateDividendEventStatus(db)

    const cnt = (await db.prepare('SELECT COUNT(*) as n FROM dividend_events').get()) as any
    expect(cnt.n).toBe(2)
  })
})