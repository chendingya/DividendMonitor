import { getDatabase } from '@main/infrastructure/db/sqlite'
import type { DividendEvent } from '@main/domain/entities/Stock'

type DividendEventRow = {
  asset_key: string
  year: number
  fiscal_year: number | null
  announce_date: string | null
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
}

function toEvent(row: DividendEventRow): DividendEvent {
  return {
    year: row.year,
    fiscalYear: row.fiscal_year ?? undefined,
    announceDate: row.announce_date ?? undefined,
    recordDate: row.record_date ?? undefined,
    exDate: row.ex_date ?? undefined,
    payDate: row.pay_date ?? undefined,
    dividendPerShare: row.dividend_per_share,
    totalDividendAmount: row.total_dividend_amount ?? undefined,
    payoutRatio: row.payout_ratio ?? undefined,
    referenceClosePrice: row.reference_close_price,
    bonusSharePer10: row.bonus_share_per10 ?? undefined,
    transferSharePer10: row.transfer_share_per10 ?? undefined,
    source: row.source
  }
}

export class DividendRepository {
  upsertMany(assetKey: string, events: DividendEvent[]): void {
    if (events.length === 0) {
      return
    }
    const db = getDatabase()
    const fetchedAt = new Date().toISOString()
    const stmt = db.prepare(`
      INSERT INTO dividend_events (
        asset_key, year, fiscal_year, announce_date, record_date, ex_date, pay_date,
        dividend_per_share, total_dividend_amount, payout_ratio, reference_close_price,
        bonus_share_per10, transfer_share_per10, source, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(asset_key, ex_date) DO UPDATE SET
        year = excluded.year,
        fiscal_year = excluded.fiscal_year,
        announce_date = excluded.announce_date,
        record_date = excluded.record_date,
        pay_date = excluded.pay_date,
        dividend_per_share = excluded.dividend_per_share,
        total_dividend_amount = excluded.total_dividend_amount,
        payout_ratio = excluded.payout_ratio,
        reference_close_price = excluded.reference_close_price,
        bonus_share_per10 = excluded.bonus_share_per10,
        transfer_share_per10 = excluded.transfer_share_per10,
        source = excluded.source,
        fetched_at = excluded.fetched_at
    `)
    db.exec('BEGIN')
    try {
      for (const event of events) {
        stmt.run(
          assetKey,
          event.year,
          event.fiscalYear ?? null,
          event.announceDate ?? null,
          event.recordDate ?? null,
          event.exDate ?? null,
          event.payDate ?? null,
          event.dividendPerShare,
          event.totalDividendAmount ?? null,
          event.payoutRatio ?? null,
          event.referenceClosePrice,
          event.bonusSharePer10 ?? null,
          event.transferSharePer10 ?? null,
          event.source,
          fetchedAt
        )
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  listByAsset(assetKey: string): DividendEvent[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT * FROM dividend_events WHERE asset_key = ? ORDER BY ex_date ASC')
      .all(assetKey) as DividendEventRow[]
    return rows.map(toEvent)
  }

  listPendingCorporateActions(assetKey: string, sinceExDate?: string): DividendEvent[] {
    const db = getDatabase()
    const rows = sinceExDate
      ? (db
          .prepare('SELECT * FROM dividend_events WHERE asset_key = ? AND ex_date > ? ORDER BY ex_date ASC')
          .all(assetKey, sinceExDate) as DividendEventRow[])
      : (db
          .prepare('SELECT * FROM dividend_events WHERE asset_key = ? ORDER BY ex_date ASC')
          .all(assetKey) as DividendEventRow[])
    return rows.map(toEvent)
  }

  listAssetKeysWithEvents(): string[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT DISTINCT asset_key FROM dividend_events')
      .all() as Array<{ asset_key: string }>
    return rows.map((row) => row.asset_key)
  }

  listAll(options?: { fromDate?: string; toDate?: string; assetKeys?: string[] }): DividendEventWithAsset[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: string[] = []

    if (options?.fromDate) {
      conditions.push('ex_date >= ?')
      params.push(options.fromDate)
    }
    if (options?.toDate) {
      conditions.push('ex_date <= ?')
      params.push(options.toDate)
    }
    if (options?.assetKeys && options.assetKeys.length > 0) {
      conditions.push(`asset_key IN (${options.assetKeys.map(() => '?').join(',')})`)
      params.push(...options.assetKeys)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = db
      .prepare(`SELECT * FROM dividend_events ${whereClause} ORDER BY ex_date DESC`)
      .all(...params) as DividendEventRow[]
    return rows.map((row) => ({ ...toEvent(row), assetKey: row.asset_key }))
  }
}

export type DividendEventWithAsset = DividendEvent & { assetKey: string }
