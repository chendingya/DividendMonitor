import { type DatabaseSync } from 'node:sqlite'
import type { CachedEntry, RequestCacheStore } from '@main/infrastructure/dataSources/cache/requestCache'
import { getDatabase } from '@main/infrastructure/db/sqlite'

/** set 时惰性清理的保留窗口：早于该时间戳的请求级缓存条目直接删除 */
const CLEANUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * RequestCache 的 SQLite 持久化后端（request_cache 表）。
 * 配合内存缓存实现「磁盘兜底 + 重启不失效」，写入与清理均惰性同步完成。
 * SQLite 不可用（如无 Electron 的测试环境）时自动降级为纯内存缓存，不阻断请求。
 */
export class SqliteRequestCacheStore implements RequestCacheStore {
  private db: DatabaseSync | null | undefined

  private getDb(): DatabaseSync | null {
    if (this.db !== undefined) return this.db
    try {
      this.db = getDatabase()
    } catch (error) {
      console.warn(
        '[RequestCache] SQLite 持久化不可用，请求级缓存降级为纯内存:',
        error instanceof Error ? error.message : error
      )
      this.db = null
    }
    return this.db
  }

  get(key: string): CachedEntry<unknown> | null {
    const db = this.getDb()
    if (!db) return null

    const row = db
      .prepare('SELECT data_json FROM request_cache WHERE cache_key = ?')
      .get(key) as { data_json: string } | undefined
    if (!row) return null

    try {
      return JSON.parse(row.data_json) as CachedEntry<unknown>
    } catch {
      return null
    }
  }

  set(key: string, entry: CachedEntry<unknown>): void {
    const db = this.getDb()
    if (!db) return

    db.prepare('DELETE FROM request_cache WHERE cache_key = ?').run(key)
    db.prepare('INSERT INTO request_cache (cache_key, data_json, cached_at) VALUES (?, ?, ?)').run(
      key,
      JSON.stringify(entry),
      entry.cachedAt
    )
    db.prepare('DELETE FROM request_cache WHERE cached_at < ?').run(
      new Date(Date.now() - CLEANUP_WINDOW_MS).toISOString()
    )
  }

  delete(key: string): void {
    const db = this.getDb()
    if (!db) return
    db.prepare('DELETE FROM request_cache WHERE cache_key = ?').run(key)
  }

  clear(): void {
    const db = this.getDb()
    if (!db) return
    db.exec('DELETE FROM request_cache')
  }
}
