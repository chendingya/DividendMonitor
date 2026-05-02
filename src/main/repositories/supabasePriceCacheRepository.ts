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
  private readonly savingCodes = new Set<string>()
  private readonly lastPushedAt = new Map<string, number>()
  private readonly PUSH_COOLDOWN_MS = 60_000

  getPriceHistory(code: string): HistoricalPricePoint[] {
    const local = this.sqlite.getPriceHistory(code)
    if (local.length > 0) return local

    // Local is empty — pull from Supabase cross-device shared cache.
    // Fire-and-forget: if it fails we just return empty; next fetch
    // from Sina/Tencent will rebuild locally.
    this.pullFromSupabase(code).catch((err) => {
      console.warn(`[PriceCache] Supabase pull failed for ${code}:`, err instanceof Error ? err.message : String(err))
    })

    return local
  }

  getLatestDate(code: string): string | undefined {
    return this.sqlite.getLatestDate(code)
  }

  mergeAndReturn(code: string, newPrices: HistoricalPricePoint[]): HistoricalPricePoint[] {
    return this.sqlite.mergeAndReturn(code, newPrices)
  }

  savePriceHistory(code: string, prices: HistoricalPricePoint[]): void {
    // Always persist to local SQLite immediately — never drop new data.
    this.sqlite.savePriceHistory(code, prices)

    // Throttle Supabase pushes:
    // 1. Skip if a push for this code is already in flight.
    // 2. Skip if a push completed less than PUSH_COOLDOWN_MS ago.
    if (this.savingCodes.has(code)) {
      return
    }
    const lastPush = this.lastPushedAt.get(code)
    if (lastPush && Date.now() - lastPush < this.PUSH_COOLDOWN_MS) {
      return
    }

    this.savingCodes.add(code)

    // Push ALL local rows for this code to Supabase, not just the new batch.
    // This ensures that when switching from offline to online, the full
    // history accumulated locally is synced in one shot. upsert with
    // ignoreDuplicates handles dedup — existing rows are skipped.
    const allRows = this.sqlite.getPriceHistory(code)
    this.pushToSupabase(code, allRows)
      .then((count) => {
        if (count > 0) {
          console.log(`[PriceCache] Synced ${count} rows to Supabase for ${code}`)
          this.lastPushedAt.set(code, Date.now())
        }
      })
      .catch((err) => {
        console.warn(`[PriceCache] Supabase push failed for ${code}:`, err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        this.savingCodes.delete(code)
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

  /**
   * Pull price history from Supabase shared cache and write to local SQLite.
   */
  private async pullFromSupabase(code: string): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) return

    const { data, error } = await supabase
      .from('price_cache')
      .select('date, close')
      .eq('code', code)
      .order('date', { ascending: true })

    if (error || !data || data.length === 0) return

    const rows = data as Array<{ date: string; close: number }>
    this.sqlite.savePriceHistory(code, rows)
    console.log(`[PriceCache] Pulled ${rows.length} rows from Supabase for ${code}`)
  }
}
