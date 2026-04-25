import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

let database: DatabaseSync | null = null

function getDatabaseFilePath() {
  return join(app.getPath('userData'), 'db', 'dividend-monitor.sqlite')
}

function initializeSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist_items (
      symbol TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_watchlist_items_updated_at
      ON watchlist_items(updated_at DESC);
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
