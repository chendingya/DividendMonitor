import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

let database: DatabaseSync | null = null

function getDatabaseFilePath() {
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

function initializeSchema(db: DatabaseSync) {
  createBaseSchema(db)
  migrateLegacyWatchlistTable(db)
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

  database = new DatabaseSync(filePath)
  initializeSchema(database)
  return database
}

export function getDatabaseFilePathForDebug() {
  return getDatabaseFilePath()
}
