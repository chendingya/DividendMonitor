import { getSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import { notifySyncStatus } from '@main/infrastructure/supabase/syncStatusNotifier'
import { DividendRepository, type DividendEventWithAsset } from '@main/repositories/dividendRepository'
import type { IDividendRepository } from '@main/repositories/interfaces'
import type { DividendEvent } from '@main/domain/entities/Stock'

type DividendEventRow = {
  asset_key: string
  year: number
  fiscal_year: number | null
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

export class SupabaseDividendRepository implements IDividendRepository {
  private readonly localRepo = new DividendRepository()

  upsertMany(assetKey: string, events: DividendEvent[]): void {
    this.localRepo.upsertMany(assetKey, events)

    void this.pushToSupabase(assetKey, events).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[SupabaseDividendRepository] 同步失败 ${assetKey}:`, message)
      notifySyncStatus({ status: 'offline-fallback', message: `分红方案同步失败：${message}。数据已保存在本地。` })
    })
  }

  private async pushToSupabase(assetKey: string, events: DividendEvent[]): Promise<void> {
    if (events.length === 0) return
    const supabase = getSupabaseClient()
    if (!supabase) return

    const fetchedAt = new Date().toISOString()
    const rows: DividendEventRow[] = events.map((event) => {
      const announceDate = event.announceDate ?? event.exDate
      if (!announceDate) {
        throw new Error(`DividendEvent upsert: missing announce_date and ex_date for asset ${assetKey}`)
      }
      return {
        asset_key: assetKey,
        year: event.year,
        fiscal_year: event.fiscalYear ?? null,
        announce_date: announceDate,
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
      }
    })

    const { error } = await supabase
      .from('dividend_events')
      .upsert(rows, { onConflict: 'asset_key,announce_date,fiscal_year' })

    if (error) throw new Error(error.message)

    notifySyncStatus({ status: 'synced' })
  }

  listByAsset(assetKey: string): DividendEvent[] {
    return this.localRepo.listByAsset(assetKey)
  }

  listPendingCorporateActions(assetKey: string, sinceExDate?: string): DividendEvent[] {
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