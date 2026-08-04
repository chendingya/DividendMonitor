import { getDatabase } from '@main/infrastructure/db/sqlite'
import type { YieldMapStockEntry } from '@main/domain/services/yieldMapService'

type YieldMapRow = {
  asset_key: string
  symbol: string
  name: string
  industry: string
  price: number | null
  yield_ttm: number
  total_dps_12m: number | null
  fetched_at: string
}

function toEntry(row: YieldMapRow): YieldMapStockEntry {
  return {
    assetKey: row.asset_key,
    symbol: row.symbol,
    name: row.name,
    industry: row.industry,
    price: row.price ?? undefined,
    yieldTtm: row.yield_ttm,
    totalDps12m: row.total_dps_12m ?? undefined
  }
}

export class YieldMapRepository {
  replaceAll(entries: YieldMapStockEntry[]): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM yield_map_snapshots').run()
      const insert = db.prepare(`
        INSERT INTO yield_map_snapshots
          (asset_key, symbol, name, industry, price, yield_ttm, total_dps_12m, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const entry of entries) {
        insert.run(
          entry.assetKey,
          entry.symbol,
          entry.name,
          entry.industry,
          entry.price ?? null,
          entry.yieldTtm,
          entry.totalDps12m ?? null,
          now
        )
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  getAll(): YieldMapStockEntry[] {
    const rows = getDatabase()
      .prepare('SELECT * FROM yield_map_snapshots')
      .all() as unknown as YieldMapRow[]
    return rows.map(toEntry)
  }

  getFetchedAt(): string | null {
    const row = getDatabase()
      .prepare('SELECT MAX(fetched_at) AS latest FROM yield_map_snapshots')
      .get() as { latest: string | null }
    return row.latest ?? null
  }
}
