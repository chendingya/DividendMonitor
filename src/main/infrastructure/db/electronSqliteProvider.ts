import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setDatabaseResolver, initializeSchema } from './sqlite'

let installed = false

export function getDatabaseFilePath(): string {
  return join(app.getPath('userData'), 'db', 'dividend-monitor.sqlite')
}

export function getDatabaseFilePathForDebug(): string {
  return getDatabaseFilePath()
}

/** 安装 Electron 桌面端的 SQLite provider（幂等）。在 main 进程任何 DB 使用之前调用。 */
export function installElectronSqliteProvider(): void {
  if (installed) {
    return
  }
  installed = true
  setDatabaseResolver(() => {
    const filePath = getDatabaseFilePath()
    mkdirSync(join(filePath, '..'), { recursive: true })
    const db = new DatabaseSync(filePath)
    // schema/迁移初始化随连接创建在 provider 内完成：失败时 getDatabase
    // 不会缓存半初始化连接，下次访问可重试
    initializeSchema(db)
    return db
  })
}
