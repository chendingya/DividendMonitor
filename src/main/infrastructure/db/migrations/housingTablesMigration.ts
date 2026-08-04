import type { DatabaseSync } from 'node:sqlite'

export function migrateHousingTables(db: DatabaseSync): void {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('housing_index_cache', 'user_housing_data', 'housing_watchlist')")
    .all() as Array<{ name: string }>
  const existing = new Set(tables.map((row) => row.name))

  if (!existing.has('housing_index_cache')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS housing_index_cache (
        city_code TEXT NOT NULL,
        period TEXT NOT NULL,
        new_home_index_mom REAL,
        new_home_index_yoy REAL,
        second_hand_index_mom REAL,
        second_hand_index_yoy REAL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (city_code, period)
      );
    `)
  }

  if (!existing.has('user_housing_data')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_housing_data (
        id TEXT PRIMARY KEY,
        city_code TEXT NOT NULL,
        district TEXT,
        community TEXT,
        price_per_sqm REAL,
        rent_per_sqm REAL,
        note TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_housing_data_city ON user_housing_data(city_code);
    `)
  }

  if (!existing.has('housing_watchlist')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS housing_watchlist (
        city_code TEXT PRIMARY KEY,
        city_name TEXT NOT NULL,
        added_at TEXT NOT NULL
      );
    `)
  }
}
