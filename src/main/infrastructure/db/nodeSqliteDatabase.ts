import type { DatabaseSync } from 'node:sqlite'
import type { SqliteDatabase } from './databaseTypes'
import { createSerializedDatabase } from './serializedDatabase'

/** Adapt the desktop driver without allowing Node dependencies into shared SQL consumers. */
export function createNodeSqliteDatabase(native: DatabaseSync): SqliteDatabase {
  return createSerializedDatabase({
    async exec(sql) { native.exec(sql) },
    prepare(sql) {
      return {
        async all(...params) { return native.prepare(sql).all(...params) },
        async get(...params) { return native.prepare(sql).get(...params) },
        async run(...params) { return native.prepare(sql).run(...params) }
      }
    },
    async close() { native.close() }
  })
}
