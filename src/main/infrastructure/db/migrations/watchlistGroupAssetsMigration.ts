import type { DatabaseSync } from 'node:sqlite'

export function migrateWatchlistGroupAssetsForeignKey(db: DatabaseSync): void {
  const tableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='watchlist_group_assets'")
    .get() as { sql: string } | undefined
  if (!tableInfo) return

  if (!tableInfo.sql.includes('REFERENCES watchlist_items')) return

  db.exec(`
    BEGIN;

    CREATE TABLE IF NOT EXISTS watchlist_group_assets_v2 (
      group_id TEXT NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
      asset_key TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (group_id, asset_key)
    );

    INSERT OR IGNORE INTO watchlist_group_assets_v2 (group_id, asset_key, added_at)
    SELECT group_id, asset_key, added_at FROM watchlist_group_assets;

    DROP TABLE watchlist_group_assets;
    ALTER TABLE watchlist_group_assets_v2 RENAME TO watchlist_group_assets;

    CREATE INDEX IF NOT EXISTS idx_watchlist_group_assets_group
      ON watchlist_group_assets(group_id, added_at DESC);

    COMMIT;
  `)
}
