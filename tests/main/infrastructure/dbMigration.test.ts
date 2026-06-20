import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'

const { migrateWatchlistGroupAssetsForeignKey } = await import(
  '@main/infrastructure/db/migrations/watchlistGroupAssetsMigration'
)
const { migratePortfolioRiskLevelColumn } = await import(
  '@main/infrastructure/db/migrations/portfolioRiskLevelMigration'
)

describe('db migrations', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
  })

  it('watchlist_group_assets 迁移后无对 watchlist_items 的外键', () => {
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(`
      CREATE TABLE watchlist_items (
        asset_key TEXT PRIMARY KEY,
        asset_type TEXT NOT NULL,
        market TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE watchlist_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE watchlist_group_assets (
        group_id TEXT NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
        asset_key TEXT NOT NULL REFERENCES watchlist_items(asset_key) ON DELETE CASCADE,
        added_at TEXT NOT NULL,
        PRIMARY KEY (group_id, asset_key)
      );
      INSERT INTO watchlist_items VALUES ('STOCK:A_SHARE:600519','STOCK','A_SHARE','600519','贵州茅台','2026-01-01','2026-01-01');
      INSERT INTO watchlist_groups VALUES ('g1','测试组',NULL,0,'2026-01-01','2026-01-01');
      INSERT INTO watchlist_group_assets VALUES ('g1','STOCK:A_SHARE:600519','2026-01-01');
    `)

    migrateWatchlistGroupAssetsForeignKey(db)

    db.prepare('DELETE FROM watchlist_items WHERE asset_key = ?').run('STOCK:A_SHARE:600519')
    db.prepare('INSERT OR IGNORE INTO watchlist_group_assets VALUES (?,?,?)').run(
      'g1',
      'STOCK:A_SHARE:600519',
      '2026-01-02'
    )
    const row = db
      .prepare('SELECT asset_key FROM watchlist_group_assets WHERE group_id=? AND asset_key=?')
      .get('g1', 'STOCK:A_SHARE:600519')
    expect(row).toBeTruthy()

    const allRows = db.prepare('SELECT * FROM watchlist_group_assets').all()
    expect(allRows.length).toBe(1)
  })

  it('portfolio_positions 加 risk_level 列', () => {
    db.exec(`
      CREATE TABLE portfolio_positions (
        id TEXT PRIMARY KEY,
        asset_key TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        market TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        direction TEXT NOT NULL,
        shares REAL NOT NULL,
        avg_cost REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    migratePortfolioRiskLevelColumn(db)

    db.prepare(
      'INSERT INTO portfolio_positions (id, asset_key, asset_type, market, code, name, direction, shares, avg_cost, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(
      'p1',
      'STOCK:A_SHARE:600519',
      'STOCK',
      'A_SHARE',
      '600519',
      '贵州茅台',
      'BUY',
      100,
      1500,
      '2026-01-01',
      '2026-01-01'
    )
    const row = db.prepare('SELECT risk_level FROM portfolio_positions WHERE id=?').get('p1') as {
      risk_level: string | null
    }
    expect(row.risk_level).toBeNull()

    db.prepare('UPDATE portfolio_positions SET risk_level=? WHERE id=?').run('LOW', 'p1')
    const updated = db.prepare('SELECT risk_level FROM portfolio_positions WHERE id=?').get('p1') as {
      risk_level: string
    }
    expect(updated.risk_level).toBe('LOW')
  })
})
