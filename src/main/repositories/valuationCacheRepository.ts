import { getDatabase } from '@main/infrastructure/db/sqlite'

export type ValuationCacheRow = {
  cacheKey: string
  dataJson: string
  fetchedAt: string
}

export class ValuationCacheRepository {
  async upsert(cacheKey: string, dataJson: string): Promise<void> {
    const db = getDatabase()
    await db.prepare(
      `INSERT OR REPLACE INTO valuation_cache (cache_key, data_json, fetched_at)
       VALUES (?, ?, ?)`
    ).run(cacheKey, dataJson, new Date().toISOString())
  }

  async findByKey(cacheKey: string): Promise<ValuationCacheRow | undefined> {
    const db = getDatabase()
    const row = (await db
      .prepare('SELECT cache_key, data_json, fetched_at FROM valuation_cache WHERE cache_key = ?')
      .get(cacheKey)) as Record<string, string> | undefined
    if (!row) return undefined
    return {
      cacheKey: row.cache_key,
      dataJson: row.data_json,
      fetchedAt: row.fetched_at
    }
  }

  async findFreshByKey<T>(cacheKey: string, ttlMs: number): Promise<T | undefined> {
    try {
      const row = (await this.findByKey(cacheKey))
      if (!row) return undefined
      const fetchedAtMs = new Date(row.fetchedAt).getTime()
      // 与 TimedCache 语义一致：恰好 TTL 边界仍视为新鲜（严格小于才算过期）
      if (fetchedAtMs + ttlMs < Date.now()) return undefined
      return JSON.parse(row.dataJson) as T
    } catch {
      return undefined
    }
  }
}
