import { getSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import { getDatabase } from '@main/infrastructure/db/sqlite'
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
 * - Writes go to SQLite + Supabase (best-effort)
 * - On cache miss, falls back to Supabase before calling external APIs
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

  /** Try to pull from Supabase when local cache is empty. */
  async pullFromSupabase(code: string): Promise<HistoricalPricePoint[]> {
    const supabase = getSupabaseClient()
    if (!supabase) return []

    try {
      const { data, error } = await supabase
        .from('price_cache')
        .select('date, close')
        .eq('code', code)
        .order('date', { ascending: true })

      if (error || !data) {
        if (error) console.warn(`[PriceCache] Supabase pull failed for ${code}:`, error.message)
        return []
      }

      const prices = (data as Array<{ date: string; close: number }>).map((row) => ({
        date: row.date,
        close: row.close
      }))

      if (prices.length > 0) {
        this.sqlite.savePriceHistory(code, prices)
      }

      return prices
    } catch (err) {
      console.warn(`[PriceCache] Supabase pull error for ${code}:`, err instanceof Error ? err.message : String(err))
      return []
    }
  }

  /**
   * Seed local cache from Supabase if available.
   * Used when a user logs in on a new device — pulls existing cache
   * from cloud so we don't have to re-fetch everything from Sina.
   */
  async seedFromSupabaseIfNeeded(code: string): Promise<boolean> {
    const local = this.sqlite.getPriceHistory(code)
    if (local.length > 100) return false // Already have sufficient data

    const cloud = await this.pullFromSupabase(code)
    return cloud.length > 0
  }

  /**
   * Push locally cached price data to Supabase for any codes
   * that are missing from the cloud. Safe to call repeatedly.
   */
  async syncAllLocalCacheToSupabase(): Promise<void> {
    const db = getDatabase()
    const codes = db
      .prepare('SELECT DISTINCT code FROM price_cache')
      .all() as Array<{ code: string }>

    if (codes.length === 0) {
      return
    }

    const missing: string[] = []

    for (const { code } of codes) {
      try {
        const count = await this.getSupabaseRowCount(code)
        if (count === 0) {
          missing.push(code)
        }
      } catch {
        // If we can't check, assume missing and try to push
        missing.push(code)
      }
    }

    if (missing.length === 0) {
      console.log('[PriceCache] All local data already synced to Supabase')
      return
    }

    console.log(`[PriceCache] Syncing ${missing.length} stock(s) missing from Supabase...`)

    const BATCH_SIZE = 3
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (code) => {
          const prices = this.sqlite.getPriceHistory(code)
          if (prices.length === 0) return { code, count: 0 }
          const count = await this.pushToSupabase(code, prices)
          return { code, count }
        })
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.count > 0) {
          console.log(`[PriceCache] Synced ${r.value.count} rows for ${r.value.code}`)
        } else if (r.status === 'rejected') {
          console.warn(`[PriceCache] Failed to sync batch item:`, r.reason instanceof Error ? r.reason.message : String(r.reason))
        }
      }
    }

    console.log('[PriceCache] Local cache sync complete')
  }

  private async getSupabaseRowCount(code: string): Promise<number> {
    const supabase = getSupabaseClient()
    if (!supabase) return 0

    const { count, error } = await supabase
      .from('price_cache')
      .select('*', { count: 'exact', head: true })
      .eq('code', code)

    if (error) throw error
    return count ?? 0
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
