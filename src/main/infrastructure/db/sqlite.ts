import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { migrateWatchlistGroupAssetsForeignKey } from '@main/infrastructure/db/migrations/watchlistGroupAssetsMigration'
import { migratePortfolioRiskLevelColumn } from '@main/infrastructure/db/migrations/portfolioRiskLevelMigration'
import { migrateCorporateActionsCursorReset } from '@main/infrastructure/db/migrations/corporateActionsCursorResetMigration'
import { migrateCorporateActionsCursorResetV2 } from '@main/infrastructure/db/migrations/corporateActionsCursorResetV2Migration'
import { migrateDividendEventStatus } from '@main/infrastructure/db/migrations/dividendEventStatusMigration'
import { migrateHousingTables } from '@main/infrastructure/db/migrations/housingTablesMigration'

let database: DatabaseSync | null = null

export function getDatabaseFilePath() {
  return join(app.getPath('userData'), 'db', 'dividend-monitor.sqlite')
}

function createBaseSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist_items (
      asset_key TEXT PRIMARY KEY,
      asset_type TEXT NOT NULL,
      market TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_positions (
      id TEXT PRIMARY KEY,
      asset_key TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      market TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      direction TEXT NOT NULL,
      shares REAL NOT NULL,
      avg_cost REAL NOT NULL,
      opened_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_snapshots (
      asset_key TEXT PRIMARY KEY,
      asset_type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_watchlist_items_updated_at
      ON watchlist_items(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_portfolio_positions_updated_at
      ON portfolio_positions(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_portfolio_positions_asset_identity
      ON portfolio_positions(asset_key, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_asset_snapshots_fetched_at
      ON asset_snapshots(fetched_at DESC);

    CREATE INDEX IF NOT EXISTS idx_asset_snapshots_asset_type
      ON asset_snapshots(asset_type);

    CREATE TABLE IF NOT EXISTS portfolio_risk_snapshots (
      cache_key TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_portfolio_risk_snapshots_fetched_at
      ON portfolio_risk_snapshots(fetched_at DESC);

    CREATE TABLE IF NOT EXISTS valuation_cache (
      cache_key TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_valuation_cache_fetched_at
      ON valuation_cache(fetched_at DESC);

    CREATE TABLE IF NOT EXISTS price_cache (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      close REAL NOT NULL,
      PRIMARY KEY (code, date)
    );

    CREATE INDEX IF NOT EXISTS idx_price_cache_code ON price_cache(code);

    CREATE TABLE IF NOT EXISTS dividend_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_key TEXT NOT NULL,
      year INTEGER NOT NULL,
      fiscal_year INTEGER NOT NULL,
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


    CREATE TABLE IF NOT EXISTS backtest_results (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      asset_key TEXT NOT NULL,
      buy_date TEXT NOT NULL,
      dca_config TEXT,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_backtest_results_created_at
      ON backtest_results(created_at DESC);

    CREATE TABLE IF NOT EXISTS watchlist_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist_group_assets (
      group_id TEXT NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
      asset_key TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (group_id, asset_key)
    );

    CREATE INDEX IF NOT EXISTS idx_watchlist_groups_sort
      ON watchlist_groups(sort_order ASC, name ASC);

    CREATE INDEX IF NOT EXISTS idx_watchlist_group_assets_group
      ON watchlist_group_assets(group_id, added_at DESC);
  `)
}

function getWatchlistColumns(db: DatabaseSync) {
  return db
    .prepare('PRAGMA table_info(watchlist_items)')
    .all() as Array<{ name: string }>
}

function migrateLegacyWatchlistTable(db: DatabaseSync) {
  const columns = getWatchlistColumns(db).map((column) => column.name)
  if (columns.includes('asset_key')) {
    return
  }

  db.exec(`
    BEGIN;

    CREATE TABLE IF NOT EXISTS watchlist_items_v2 (
      asset_key TEXT PRIMARY KEY,
      asset_type TEXT NOT NULL,
      market TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO watchlist_items_v2 (asset_key, asset_type, market, code, name, created_at, updated_at)
    SELECT
      'STOCK:A_SHARE:' || symbol,
      'STOCK',
      'A_SHARE',
      symbol,
      NULL,
      created_at,
      updated_at
    FROM watchlist_items;

    DROP TABLE watchlist_items;
    ALTER TABLE watchlist_items_v2 RENAME TO watchlist_items;

    CREATE INDEX IF NOT EXISTS idx_watchlist_items_updated_at
      ON watchlist_items(updated_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_items_asset_identity
      ON watchlist_items(asset_type, market, code);

    COMMIT;
  `)
}

function migrateWatchlistAssetTypes(db: DatabaseSync) {
  const isEtfCode = (code: string) => /^(5\d{5}|1[15]\d{4})$/.test(code)

  const rows = db
    .prepare("SELECT asset_key, asset_type, code FROM watchlist_items WHERE asset_type IN ('ETF', 'FUND')")
    .all() as Array<{ asset_key: string; asset_type: string; code: string }>

  for (const row of rows) {
    const expectedType = isEtfCode(row.code) ? 'ETF' : 'FUND'
    if (row.asset_type !== expectedType) {
      const newKey = `${expectedType}:A_SHARE:${row.code}`
      db.prepare('UPDATE watchlist_items SET asset_type = ?, asset_key = ? WHERE asset_key = ?').run(
        expectedType,
        newKey,
        row.asset_key
      )
    }
  }
}

function initializeSchema(db: DatabaseSync) {
  createBaseSchema(db)
  migrateLegacyWatchlistTable(db)
  migrateWatchlistAssetTypes(db)
  migrateWatchlistGroupAssetsForeignKey(db)
  migratePortfolioRiskLevelColumn(db)
  migratePortfolioCorporateActionColumn(db)
  migratePortfolioOpenedAtColumn(db)
  migratePortfolioTradePriceColumn(db)
  migrateCorporateActionsCursorReset(db)
  migrateCorporateActionsCursorResetV2(db)
  migrateDividendEventStatus(db)
  migrateDividendFiscalYearNotNull(db)
  migrateYieldMapSnapshots(db)
  migrateHousingTables(db)
  // dividend_events 索引必须在迁移之后创建：旧库（无 status 列）在迁移前建
  // status 索引会因 "no such column" 抛错，且 CREATE INDEX IF NOT EXISTS
  // 只跳过已存在的索引、不会校验列是否存在。
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_dividend_events_asset_key ON dividend_events(asset_key);
    CREATE INDEX IF NOT EXISTS idx_dividend_events_ex_date ON dividend_events(ex_date);
    CREATE INDEX IF NOT EXISTS idx_dividend_events_status ON dividend_events(status);
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watchlist_items_updated_at
      ON watchlist_items(updated_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_items_asset_identity
      ON watchlist_items(asset_type, market, code);

    CREATE INDEX IF NOT EXISTS idx_portfolio_positions_updated_at
      ON portfolio_positions(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_portfolio_positions_asset_identity
      ON portfolio_positions(asset_key, updated_at DESC);
  `)
}

export function getDatabase() {
  if (database) {
    return database
  }

  const filePath = getDatabaseFilePath()
  mkdirSync(dirname(filePath), { recursive: true })

  // 先初始化成功再赋值缓存：若初始化抛错，下次调用可重试，
  // 避免留下半初始化的数据库连接。
  const db = new DatabaseSync(filePath)
  initializeSchema(db)
  database = db
  return database
}

export function closeDatabase(): void {
  if (!database) {
    return
  }
  database.close()
  database = null
}

function migratePortfolioCorporateActionColumn(db: DatabaseSync) {
  const columns = db.prepare('PRAGMA table_info(portfolio_positions)').all() as Array<{ name: string }>
  if (columns.some((col) => col.name === 'corporate_actions_applied_until')) {
    return
  }

  db.exec('ALTER TABLE portfolio_positions ADD COLUMN corporate_actions_applied_until TEXT;')
}

function migratePortfolioOpenedAtColumn(db: DatabaseSync) {
  const columns = db.prepare('PRAGMA table_info(portfolio_positions)').all() as Array<{ name: string }>
  if (columns.some((col) => col.name === 'opened_at')) {
    return
  }

  db.exec('ALTER TABLE portfolio_positions ADD COLUMN opened_at TEXT;')
}

function migratePortfolioTradePriceColumn(db: DatabaseSync) {
  const columns = db.prepare('PRAGMA table_info(portfolio_positions)').all() as Array<{ name: string }>
  if (columns.some((col) => col.name === 'trade_price')) {
    return
  }

  db.exec('ALTER TABLE portfolio_positions ADD COLUMN trade_price REAL;')
}

/**
 * 补丁迁移：fiscal_year 参与唯一键 (asset_key, announce_date, fiscal_year)，
 * NULL 在唯一索引中互不相同会导致重复行且云端 NOT NULL 约束拒绝写入，
 * 因此回填为 year、按新唯一键去重后重建为 NOT NULL 列。
 */
function migrateDividendFiscalYearNotNull(db: DatabaseSync) {
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dividend_events'").all() as Array<{ name: string }>
    if (tables.length === 0) return

    const cols = db.prepare('PRAGMA table_info(dividend_events)').all() as Array<{ name: string; notnull: number }>
    const fiscalYearCol = cols.find((c) => c.name === 'fiscal_year')
    if (!fiscalYearCol || Number(fiscalYearCol.notnull) === 1) {
      return
    }

    db.exec(`
      BEGIN;

      UPDATE dividend_events SET fiscal_year = year WHERE fiscal_year IS NULL;

      DELETE FROM dividend_events
      WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM dividend_events
        GROUP BY asset_key, announce_date, fiscal_year
      );

      CREATE TABLE dividend_events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_key TEXT NOT NULL,
        year INTEGER NOT NULL,
        fiscal_year INTEGER NOT NULL,
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

      INSERT INTO dividend_events_new (
        asset_key, year, fiscal_year, announce_date, record_date, ex_date, pay_date,
        dividend_per_share, total_dividend_amount, payout_ratio, reference_close_price,
        bonus_share_per10, transfer_share_per10, source, fetched_at, status, announcement_progress
      )
      SELECT
        asset_key, year, fiscal_year,
        COALESCE(announce_date, ex_date, '1970-01-01') AS announce_date,
        record_date, ex_date, pay_date,
        dividend_per_share, total_dividend_amount, payout_ratio, reference_close_price,
        bonus_share_per10, transfer_share_per10, source, fetched_at, status, announcement_progress
      FROM dividend_events;

      DROP TABLE dividend_events;
      ALTER TABLE dividend_events_new RENAME TO dividend_events;
      CREATE INDEX IF NOT EXISTS idx_dividend_events_asset_key ON dividend_events(asset_key);
      CREATE INDEX IF NOT EXISTS idx_dividend_events_ex_date ON dividend_events(ex_date);
      CREATE INDEX IF NOT EXISTS idx_dividend_events_status ON dividend_events(status);
      COMMIT;
    `)
  } catch (err) {
    console.warn('[DividendMigration] fiscal_year 归一化迁移失败，跳过:', err)
    try {
      db.exec('ROLLBACK')
    } catch {
      // 无活跃事务时忽略
    }
  }
}

export function getDatabaseFilePathForDebug() {
  return getDatabaseFilePath()
}

export function migrateYieldMapSnapshots(db: DatabaseSync) {
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
    CREATE INDEX IF NOT EXISTS idx_yield_map_snapshots_industry
      ON yield_map_snapshots(industry);
  `)
}
