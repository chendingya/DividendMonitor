import { getDatabase } from '@main/infrastructure/db/sqlite'
import type { HistoricalPricePoint } from '@main/domain/entities/Stock'

export interface IPriceCacheRepository {
  getPriceHistory(code: string): HistoricalPricePoint[]
  savePriceHistory(code: string, prices: HistoricalPricePoint[]): void
  getLatestDate(code: string): string | undefined
  /** Merge new prices into cache, keeping existing entries. Returns merged result. */
  mergeAndReturn(code: string, newPrices: HistoricalPricePoint[]): HistoricalPricePoint[]
}

export class SqlitePriceCacheRepository implements IPriceCacheRepository {
  getPriceHistory(code: string): HistoricalPricePoint[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT date, close FROM price_cache WHERE code = ? ORDER BY date ASC')
      .all(code) as Array<{ date: string; close: number }>

    return rows.map((row) => ({ date: row.date, close: row.close }))
  }

  savePriceHistory(code: string, prices: HistoricalPricePoint[]): void {
    if (prices.length === 0) return
    const db = getDatabase()
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO price_cache (code, date, close) VALUES (?, ?, ?)'
    )
    db.exec('BEGIN')
    try {
      for (const p of prices) {
        stmt.run(code, p.date, p.close)
      }
      db.exec('COMMIT')
    } catch {
      db.exec('ROLLBACK')
      throw new Error(`Failed to save price cache for ${code}`)
    }
  }

  getLatestDate(code: string): string | undefined {
    const db = getDatabase()
    const row = db
      .prepare('SELECT MAX(date) as latest FROM price_cache WHERE code = ?')
      .get(code) as { latest: string | null } | undefined
    return row?.latest ?? undefined
  }

  mergeAndReturn(code: string, newPrices: HistoricalPricePoint[]): HistoricalPricePoint[] {
    const existing = this.getPriceHistory(code)
    if (existing.length === 0) {
      this.savePriceHistory(code, newPrices)
      return [...newPrices].sort((a, b) => a.date.localeCompare(b.date))
    }

    const existingDates = new Set(existing.map((p) => p.date))
    const newEntries = newPrices.filter((p) => !existingDates.has(p.date))
    if (newEntries.length > 0) {
      this.savePriceHistory(code, newEntries)
    }

    const merged = new Map<string, number>()
    for (const p of existing) merged.set(p.date, p.close)
    for (const p of newEntries) merged.set(p.date, p.close)

    return Array.from(merged.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, close]) => ({ date, close }))
  }
}
