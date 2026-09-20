import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import { initializeSchema, setDatabaseResolver } from './sqlite'
import { createSerializedDatabase } from './serializedDatabase'
import type { SqliteExecutor, SqliteInputValue, SqliteRow } from './databaseTypes'

const DATABASE_NAME = 'dividend-monitor'

function nativeValues(params: SqliteInputValue[]): unknown[] {
  return params.map((value) => {
    if (typeof value === 'bigint') {
      const number = Number(value)
      if (!Number.isSafeInteger(number)) throw new Error('SQLite 参数超出安全整数范围')
      return number
    }
    if (value !== null && typeof value === 'object') {
      return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    }
    return value
  })
}

/** 将 Capacitor 插件结果转换为共享 SQL 执行器，业务层无需了解原生返回格式。 */
export function createNativeSqliteExecutor(connection: SQLiteDBConnection): SqliteExecutor {
  const query = async (sql: string, params: SqliteInputValue[]) => {
    const result = await connection.query(sql, nativeValues(params))
    return (result.values ?? []) as SqliteRow[]
  }
  return {
    async exec(sql) {
      const command = sql.trim().replace(/;$/, '').toUpperCase()
      if (/^BEGIN(?: TRANSACTION)?$/.test(command)) { await connection.beginTransaction(); return }
      if (/^COMMIT(?: TRANSACTION)?$/.test(command)) { await connection.commitTransaction(); return }
      if (/^ROLLBACK(?: TRANSACTION)?$/.test(command)) { await connection.rollbackTransaction(); return }
      await connection.execute(sql, false)
    },
    prepare(sql) {
      return {
        all: async (...params) => (await query(sql, params)),
        get: async (...params) => (await query(sql, params))[0],
        async run(...params) {
          const result = await connection.run(sql, nativeValues(params), false)
          return { changes: result.changes?.changes ?? 0, lastInsertRowid: result.changes?.lastId ?? 0 }
        }
      }
    },
    close: () => connection.close()
  }
}

let initialization: Promise<void> | undefined

export function installMobileNativeSqliteProvider(): Promise<void> {
  return initialization ??= (async () => {
    if (!Capacitor.isNativePlatform()) throw new Error('原生数据库仅在 Android App 内可用，请使用浏览器 HTTP 或 mock 预览')
    const manager = new SQLiteConnection(CapacitorSQLite)
    const connection = await manager.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false)
    try {
      await connection.open()
      const database = createSerializedDatabase(createNativeSqliteExecutor(connection))
      await initializeSchema(database)
      setDatabaseResolver(() => database)
    } catch (error) {
      await manager.closeConnection(DATABASE_NAME, false).catch(() => undefined)
      throw error
    }
  })().catch((error) => {
    initialization = undefined
    throw error
  })
}
