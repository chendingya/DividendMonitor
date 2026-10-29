import { getDatabase } from '@main/infrastructure/db/sqlite'
import type { HistoricalPricePoint } from '@main/domain/entities/Stock'

// 每行 3 个绑定参数，200 行共 600 个，兼容旧 SQLite 的 999 变量上限。
const PRICE_CACHE_BATCH_ROWS = 200

export interface IPriceCacheRepository {
  getPriceHistory(code: string): Promise<HistoricalPricePoint[]>
  savePriceHistory(code: string, prices: HistoricalPricePoint[]): Promise<void>
  getLatestDate(code: string): Promise<string | undefined>
  /** Merge new prices into cache, keeping existing entries. Returns merged result. */
  mergeAndReturn(code: string, newPrices: HistoricalPricePoint[]): Promise<HistoricalPricePoint[]>
}

export class SqlitePriceCacheRepository implements IPriceCacheRepository {
  async getPriceHistory(code: string): Promise<HistoricalPricePoint[]> {
    const db = getDatabase()
    const rows = (await db
      .prepare('SELECT date, close FROM price_cache WHERE code = ? ORDER BY date ASC')
      .all(code)) as Array<{ date: string; close: number }>

    return rows.map((row) => ({ date: row.date, close: row.close }))
  }

  async savePriceHistory(code: string, prices: HistoricalPricePoint[]): Promise<void> {
    if (prices.length === 0) return
    const db = getDatabase()
    try {
      await db.transaction(async (db) => {
        for (let offset = 0; offset < prices.length; offset += PRICE_CACHE_BATCH_ROWS) {
          const batch = prices.slice(offset, offset + PRICE_CACHE_BATCH_ROWS)
          // 同一事务内按批跨原生桥，避免数千次 await 持有数据库队列。
          const values = batch.map(() => '(?, ?, ?)').join(', ')
          await db.prepare(`INSERT OR REPLACE INTO price_cache (code, date, close) VALUES ${values}`)
            .run(...batch.flatMap(price => [code, price.date, price.close]))
        }
      })
    } catch {
      throw new Error(`Failed to save price cache for ${code}`)
    }
  }

  async getLatestDate(code: string): Promise<string | undefined> {
    const db = getDatabase()
    const row = (await db
      .prepare('SELECT MAX(date) as latest FROM price_cache WHERE code = ?')
      .get(code)) as { latest: string | null } | undefined
    return row?.latest ?? undefined
  }

  async mergeAndReturn(code: string, newPrices: HistoricalPricePoint[]): Promise<HistoricalPricePoint[]> {
    const existing = (await this.getPriceHistory(code))
    if (existing.length === 0) {
      await this.savePriceHistory(code, newPrices)
      return [...newPrices].sort((a, b) => a.date.localeCompare(b.date))
    }

    const existingDates = new Set(existing.map((p) => p.date))
    const newEntries = newPrices.filter((p) => !existingDates.has(p.date))
    if (newEntries.length > 0) {
      await this.savePriceHistory(code, newEntries)
    }

    const merged = new Map<string, number>()
    for (const p of existing) merged.set(p.date, p.close)
    for (const p of newEntries) merged.set(p.date, p.close)

    return Array.from(merged.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, close]) => ({ date, close }))
  }
}
