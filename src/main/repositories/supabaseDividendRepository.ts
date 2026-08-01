import { getSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import { notifySyncStatus } from '@main/infrastructure/supabase/syncStatusNotifier'
import { DividendRepository, type DividendEventWithAsset } from '@main/repositories/dividendRepository'
import type { IDividendRepository } from '@main/repositories/interfaces'
import type { DividendEvent } from '@main/domain/entities/Stock'

type DividendEventRow = {
  asset_key: string
  year: number
  fiscal_year: number
  announce_date: string
  record_date: string | null
  ex_date: string | null
  pay_date: string | null
  dividend_per_share: number
  total_dividend_amount: number | null
  payout_ratio: number | null
  reference_close_price: number
  bonus_share_per10: number | null
  transfer_share_per10: number | null
  source: string
  fetched_at: string
  status: string
  announcement_progress: string | null
}

/**
 * Online mode dividend repository: SQLite is the fast local store,
 * Supabase is the cross-device sync layer.
 *
 * - Reads always go through SQLite (fast, offline-capable)
 * - Writes go to SQLite + Supabase (best-effort, fire-and-forget)
 * - Pushes are throttled per asset (in-flight dedup + cooldown) to avoid
 *   a burst of concurrent pushes when browsing multiple asset details
 */
export class SupabaseDividendRepository implements IDividendRepository {
  private readonly localRepo = new DividendRepository()
  private readonly pushingAssets = new Set<string>()
  private readonly lastPushedAt = new Map<string, number>()
  private readonly PUSH_COOLDOWN_MS = 60_000

  upsertMany(assetKey: string, events: DividendEvent[]): void {
    this.localRepo.upsertMany(assetKey, events)

    if (events.length === 0) return
    if (this.pushingAssets.has(assetKey)) return
    const lastPush = this.lastPushedAt.get(assetKey)
    if (lastPush && Date.now() - lastPush < this.PUSH_COOLDOWN_MS) {
      return
    }

    this.pushingAssets.add(assetKey)

    // Push ALL local rows for this asset, not just the new batch. This ensures
    // that when switching from offline to online, the full history accumulated
    // locally is synced in one shot.
    const allRows = this.localRepo.listByAsset(assetKey)
    void this.pushToSupabase(assetKey, allRows)
      .then(() => {
        this.lastPushedAt.set(assetKey, Date.now())
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(`[SupabaseDividendRepository] 同步失败 ${assetKey}:`, message)
        notifySyncStatus({ status: 'offline-fallback', message: `分红方案同步失败：${message}。数据已保存在本地。` })
      })
      .finally(() => {
        this.pushingAssets.delete(assetKey)
      })
  }

  private async pushToSupabase(assetKey: string, events: DividendEvent[]): Promise<void> {
    if (events.length === 0) return
    const supabase = getSupabaseClient()
    if (!supabase) return

    const fetchedAt = new Date().toISOString()
    const rows: DividendEventRow[] = events.map((event) => ({
      asset_key: assetKey,
      year: event.year,
      fiscal_year: event.fiscalYear ?? event.year,
      announce_date: event.announceDate ?? event.exDate ?? '1970-01-01',
      record_date: event.recordDate ?? null,
      ex_date: event.exDate ?? null,
      pay_date: event.payDate ?? null,
      dividend_per_share: event.dividendPerShare,
      total_dividend_amount: event.totalDividendAmount ?? null,
      payout_ratio: event.payoutRatio ?? null,
      reference_close_price: event.referenceClosePrice,
      bonus_share_per10: event.bonusSharePer10 ?? null,
      transfer_share_per10: event.transferSharePer10 ?? null,
      source: event.source,
      fetched_at: fetchedAt,
      status: event.status ?? 'IMPLEMENTED',
      announcement_progress: event.announcementProgress ?? null
    }))

    const { error } = await supabase
      .from('dividend_events')
      .upsert(rows, { onConflict: 'asset_key,announce_date,fiscal_year' })

    if (error) throw new Error(error.message)

    notifySyncStatus({ status: 'synced' })
  }

  listByAsset(assetKey: string) {
    return this.localRepo.listByAsset(assetKey)
  }

  listPendingCorporateActions(assetKey: string, sinceExDate?: string) {
    return this.localRepo.listPendingCorporateActions(assetKey, sinceExDate)
  }

  listAssetKeysWithEvents(): string[] {
    return this.localRepo.listAssetKeysWithEvents()
  }

  listAll(options?: { fromDate?: string; toDate?: string; assetKeys?: string[] }): DividendEventWithAsset[] {
    return this.localRepo.listAll(options)
  }

  listUpcomingByAssetKeys(assetKeys: string[], sinceYear?: number): DividendEventWithAsset[] {
    return this.localRepo.listUpcomingByAssetKeys(assetKeys, sinceYear)
  }
}
