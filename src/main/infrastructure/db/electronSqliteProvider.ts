import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setDatabaseResolver, initializeSchema } from './sqlite'
import { createNodeSqliteDatabase } from './nodeSqliteDatabase'
import type { SqliteDatabase } from './databaseTypes'

let connection: SqliteDatabase | null = null
let initializing: Promise<void> | null = null

export function getDatabaseFilePath(): string {
  return join(app.getPath('userData'), 'db', 'dividend-monitor.sqlite')
}

export function getDatabaseFilePathForDebug(): string {
  return getDatabaseFilePath()
}

/** Finish migrations before exposing the connection to any application consumer. */
export async function installElectronSqliteProvider(): Promise<void> {
  if (initializing) return initializing
  if (connection) {
    setDatabaseResolver(() => connection!)
    return
  }
  initializing = (async () => {
    const filePath = getDatabaseFilePath()
    mkdirSync(join(filePath, '..'), { recursive: true })
    const db = createNodeSqliteDatabase(new DatabaseSync(filePath))
    try {
      await initializeSchema(db)
      const close = db.close.bind(db)
      db.close = async () => {
        await close()
        if (connection === db) connection = null
      }
      connection = db
      setDatabaseResolver(() => {
        if (!connection) throw new Error('数据库已关闭：请先重新初始化 SQLite provider')
        return connection
      })
    } catch (error) {
      await db.close()
      throw error
    }
  })()
  try { await initializing } finally { initializing = null }
}
