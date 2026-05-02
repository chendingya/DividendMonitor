import { getSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import type { HistoricalPricePoint } from '@main/domain/entities/Stock'
import type { IPriceCacheRepository } from '@main/repositories/priceCacheRepository'
import { SqlitePriceCacheRepository } from '@main/repositories/priceCacheRepository'

// Price cache is shared public market data — no user_id needed.
type PriceCacheRow = {
  code: string
  date: string
  close: number
}

/**
 * Online mode price cache: SQLite is the fast local cache,
 * Supabase is the cross-device sync layer.
 *
 * - Reads always go through SQLite (fast, offline-capable)
 * - Writes go to SQLite + Supabase (best-effort, fire-and-forget)
 */
export class SupabasePriceCacheRepository implements IPriceCacheRepository {
  private readonly sqlite = new SqlitePriceCacheRepository()

  getPriceHistory(code: string): HistoricalPricePoint[] {
    return this.sqlite.getPriceHistory(code)
  }

  getLatestDate(code: string): string | undefined {
    return this.sqlite.getLatestDate(code)
  }

  mergeAndReturn(code: string, newPrices: HistoricalPricePoint[]): HistoricalPricePoint[] {
    return this.sqlite.mergeAndReturn(code, newPrices)
  }

  savePriceHistory(code: string, prices: HistoricalPricePoint[]): void {
    this.sqlite.savePriceHistory(code, prices)
    this.pushToSupabase(code, prices)
      .then((count) => {
        if (count > 0) {
          console.log(`[PriceCache] Synced ${count} rows to Supabase for ${code}`)
        }
      })
      .catch((err) => {
        console.warn(`[PriceCache] Supabase push failed for ${code}:`, err instanceof Error ? err.message : String(err))
      })
  }

  /**
   * Push price rows to shared Supabase cache. All users share the same
   * market data, so no user_id is needed.
   */
  private async pushToSupabase(code: string, prices: HistoricalPricePoint[]): Promise<number> {
    const supabase = getSupabaseClient()
    if (!supabase) {
      console.warn(`[PriceCache] Skipped Supabase sync for ${code}: Supabase client unavailable`)
      return 0
    }

    const rows: PriceCacheRow[] = prices.map((p) => ({
      code,
      date: p.date,
      close: p.close
    }))

    const { error } = await supabase
      .from('price_cache')
      .upsert(rows, { onConflict: 'code,date', ignoreDuplicates: true })

    if (error) {
      throw new Error(error.message)
    }

    return rows.length
  }
}
