import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type DividendRow = {
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

type CapturedUpsert = {
  table: string
  rows: DividendRow[] | DividendRow
  options: { onConflict?: string } | undefined
}

function createSupabaseMock() {
  const captures: CapturedUpsert[] = []

  const chain = {
    async upsert(rows: DividendRow[] | DividendRow, options?: { onConflict?: string; ignoreDuplicates?: boolean }): Promise<{ data: null; error: null }> {
      captures.push({ table: '', rows, options })
      return { data: null, error: null }
    }
  }

  const supabaseMock = {
    from(table: string) {
      const c = Object.create(chain)
      c.upsert = async (rows: DividendRow[] | DividendRow, options?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        captures.push({ table, rows, options })
        return { data: null, error: null }
      }
      return c
    }
  }

  return { supabaseMock, captures }
}

type Capture = CapturedUpsert

function setupMemoryDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE dividend_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_key TEXT NOT NULL,
      year INTEGER NOT NULL,
      fiscal_year INTEGER,
      announce_date TEXT NOT NULL,
      record_date TEXT,
      ex_date TEXT,
      pay_date TEXT,
      dividend_per_share REAL NOT NULL,
      total_dividend_amount REAL,
      payout_ratio REAL,
      reference_close_price REAL NOT NULL,
      bonus_share_per10 REAL,
      transfer_share_per10 REAL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'IMPLEMENTED',
      announcement_progress TEXT,
      UNIQUE(asset_key, announce_date, fiscal_year)
    );
  `)
  return db
}

describe('SupabaseDividendRepository', () => {
  let repo: InstanceType<typeof import('@main/repositories/supabaseDividendRepository')['SupabaseDividendRepository']>
  let memoryDb: DatabaseSync
  let notifySpy: ReturnType<typeof vi.fn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    memoryDb = setupMemoryDb()
    vi.doMock('@main/infrastructure/db/sqlite', () => ({
      getDatabase: () => memoryDb,
      getDatabaseFilePathForDebug: () => ':memory:'
    }))
    notifySpy = vi.fn()
    vi.doMock('@main/infrastructure/supabase/syncStatusNotifier', () => ({
      notifySyncStatus: notifySpy
    }))
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('upsertMany 推云时字段映射为 snake_case 且 onConflict 含 asset_key,announce_date,fiscal_year', async () => {
    const { supabaseMock, captures } = createSupabaseMock()
    vi.doMock('@main/infrastructure/supabase/supabaseClient', () => ({
      getSupabaseClient: () => supabaseMock,
      resetSupabaseClient: () => {}
    }))

    const { SupabaseDividendRepository } = await import('@main/repositories/supabaseDividendRepository')
    repo = new SupabaseDividendRepository()

    repo.upsertMany('STOCK:A_SHARE:600519', [
      {
        year: 2024,
        fiscalYear: 2023,
        announceDate: '2024-06-28',
        recordDate: '2024-06-29',
        exDate: '2024-06-30',
        payDate: '2024-07-05',
        dividendPerShare: 0.5,
        totalDividendAmount: 1000,
        payoutRatio: 0.3,
        referenceClosePrice: 1500,
        bonusSharePer10: 1,
        transferSharePer10: 2,
        source: 'eastmoney',
        status: 'IMPLEMENTED',
        announcementProgress: '实施'
      }
    ])

    await vi.waitFor(() => expect(captures.length).toBe(1))
    const capture = captures[0] as Capture
    expect(capture.table).toBe('dividend_events')
    expect(capture.options?.onConflict).toBe('asset_key,announce_date,fiscal_year')

    const row = Array.isArray(capture.rows) ? (capture.rows as DividendRow[])[0] : (capture.rows as DividendRow)
    expect(row.asset_key).toBe('STOCK:A_SHARE:600519')
    expect(row.year).toBe(2024)
    expect(row.fiscal_year).toBe(2023)
    expect(row.announce_date).toBe('2024-06-28')
    expect(row.record_date).toBe('2024-06-29')
    expect(row.ex_date).toBe('2024-06-30')
    expect(row.pay_date).toBe('2024-07-05')
    expect(row.dividend_per_share).toBe(0.5)
    expect(row.total_dividend_amount).toBe(1000)
    expect(row.payout_ratio).toBe(0.3)
    expect(row.reference_close_price).toBe(1500)
    expect(row.bonus_share_per10).toBe(1)
    expect(row.transfer_share_per10).toBe(2)
    expect(row.source).toBe('eastmoney')
    expect(row.status).toBe('IMPLEMENTED')
    expect(row.announcement_progress).toBe('实施')
    expect(row.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    expect(notifySpy).toHaveBeenCalledWith({ status: 'synced' })

    const local = memoryDb.prepare('SELECT COUNT(*) as n FROM dividend_events').get() as { n: number }
    expect(local.n).toBe(1)
  })

  it('upsertMany announce_date 缺失时用 ex_date 兜底', async () => {
    const { supabaseMock, captures } = createSupabaseMock()
    vi.doMock('@main/infrastructure/supabase/supabaseClient', () => ({
      getSupabaseClient: () => supabaseMock,
      resetSupabaseClient: () => {}
    }))

    const { SupabaseDividendRepository } = await import('@main/repositories/supabaseDividendRepository')
    repo = new SupabaseDividendRepository()

    repo.upsertMany('STOCK:A_SHARE:600519', [
      {
        year: 2024,
        exDate: '2024-06-30',
        dividendPerShare: 0.5,
        referenceClosePrice: 1500,
        source: 'eastmoney',
        status: 'IMPLEMENTED'
      }
    ])

    await vi.waitFor(() => expect(captures.length).toBe(1))
    const row = (captures[0]!.rows as DividendRow[])[0]
    expect(row.announce_date).toBe('2024-06-30')
    expect(row.ex_date).toBe('2024-06-30')
  })

  it('list 方法转发本地 SQLite，不调用 supabase', async () => {
    const supabaseFromSpy = vi.fn()
    const supabaseMock = {
      from: supabaseFromSpy
    }
    vi.doMock('@main/infrastructure/supabase/supabaseClient', () => ({
      getSupabaseClient: () => supabaseMock,
      resetSupabaseClient: () => {}
    }))

    const { SupabaseDividendRepository } = await import('@main/repositories/supabaseDividendRepository')
    repo = new SupabaseDividendRepository()

    memoryDb.prepare(`INSERT INTO dividend_events (asset_key, year, fiscal_year, announce_date, ex_date, dividend_per_share, reference_close_price, source, fetched_at, status) VALUES ('STOCK:A_SHARE:600519', 2024, 2023, '2024-06-28', '2024-06-30', 0.5, 1500, 'eastmoney', '2024-01-01T00:00:00Z', 'IMPLEMENTED')`).run()

    const events = repo.listByAsset('STOCK:A_SHARE:600519')
    expect(events.length).toBe(1)
    expect(events[0].dividendPerShare).toBe(0.5)

    const pending = repo.listPendingCorporateActions('STOCK:A_SHARE:600519', '2024-01-01')
    expect(pending.length).toBe(1)

    const keys = repo.listAssetKeysWithEvents()
    expect(keys).toEqual(['STOCK:A_SHARE:600519'])

    const all = repo.listAll({ assetKeys: ['STOCK:A_SHARE:600519'] })
    expect(all.length).toBe(1)
    expect(all[0].assetKey).toBe('STOCK:A_SHARE:600519')

    const upcoming = repo.listUpcomingByAssetKeys(['STOCK:A_SHARE:600519'])
    expect(upcoming).toEqual([])

    expect(supabaseFromSpy).not.toHaveBeenCalled()
  })

  it('supabase client 不可用时降级（不抛错，仅本地落库）', async () => {
    vi.doMock('@main/infrastructure/supabase/supabaseClient', () => ({
      getSupabaseClient: () => null,
      resetSupabaseClient: () => {}
    }))

    const { SupabaseDividendRepository } = await import('@main/repositories/supabaseDividendRepository')
    repo = new SupabaseDividendRepository()

    expect(() =>
      repo.upsertMany('STOCK:A_SHARE:600519', [
        {
          year: 2024,
          announceDate: '2024-06-28',
          dividendPerShare: 0.5,
          referenceClosePrice: 1500,
          source: 'eastmoney',
          status: 'IMPLEMENTED'
        }
      ])
    ).not.toThrow()

    await new Promise((resolve) => setImmediate(resolve))

    expect(notifySpy).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'synced' }))
    expect(consoleWarnSpy).not.toHaveBeenCalled()

    const local = memoryDb.prepare('SELECT COUNT(*) as n FROM dividend_events').get() as { n: number }
    expect(local.n).toBe(1)
  })

  it('supabase upsert 报错时通知 offline-fallback 但不抛出', async () => {
    const failingMock = {
      from(_table: string) {
        return {
          async upsert(): Promise<{ data: null; error: { message: string } }> {
            return { data: null, error: { message: 'RLS denied' } }
          }
        }
      }
    }
    vi.doMock('@main/infrastructure/supabase/supabaseClient', () => ({
      getSupabaseClient: () => failingMock,
      resetSupabaseClient: () => {}
    }))

    const { SupabaseDividendRepository } = await import('@main/repositories/supabaseDividendRepository')
    repo = new SupabaseDividendRepository()

    repo.upsertMany('STOCK:A_SHARE:600519', [
      {
        year: 2024,
        announceDate: '2024-06-28',
        dividendPerShare: 0.5,
        referenceClosePrice: 1500,
        source: 'eastmoney',
        status: 'IMPLEMENTED'
      }
    ])

    await vi.waitFor(() => expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'offline-fallback' })))

    expect(consoleWarnSpy).toHaveBeenCalled()
    const local = memoryDb.prepare('SELECT COUNT(*) as n FROM dividend_events').get() as { n: number }
    expect(local.n).toBe(1)
  })

  it('upsertMany events 为空时不推送云端', async () => {
    const { supabaseMock, captures } = createSupabaseMock()
    vi.doMock('@main/infrastructure/supabase/supabaseClient', () => ({
      getSupabaseClient: () => supabaseMock,
      resetSupabaseClient: () => {}
    }))

    const { SupabaseDividendRepository } = await import('@main/repositories/supabaseDividendRepository')
    repo = new SupabaseDividendRepository()

    repo.upsertMany('STOCK:A_SHARE:600519', [])

    await new Promise((resolve) => setImmediate(resolve))
    expect(captures.length).toBe(0)
  })
})