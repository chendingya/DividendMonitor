import type { DatabaseSync } from 'node:sqlite'

export function migrateDividendEventStatus(db: DatabaseSync): void {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dividend_events'").all() as Array<{ name: string }>
  if (tables.length === 0) return

  const cols = db.prepare('PRAGMA table_info(dividend_events)').all() as Array<{ name: string }>
  const hasStatus = cols.some((c) => c.name === 'status')

  if (!hasStatus) {
    db.exec(`
      BEGIN;
      CREATE TABLE dividend_events_new (
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
        bonus_share_per10, transfer_share_per10, source, fetched_at,
        'IMPLEMENTED' AS status,
        NULL AS announcement_progress
      FROM dividend_events;

      DROP TABLE dividend_events;
      ALTER TABLE dividend_events_new RENAME TO dividend_events;
      CREATE INDEX IF NOT EXISTS idx_dividend_events_asset_key ON dividend_events(asset_key);
      CREATE INDEX IF NOT EXISTS idx_dividend_events_ex_date ON dividend_events(ex_date);
      CREATE INDEX IF NOT EXISTS idx_dividend_events_status ON dividend_events(status);
      COMMIT;
    `)
  }
}