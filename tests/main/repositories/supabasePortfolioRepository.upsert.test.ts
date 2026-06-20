import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type UpsertRow = {
  id: string
  user_id: string
  asset_key: string
  asset_type: string
  market: string
  code: string
  name: string
  direction: string
  shares: number
  avg_cost: number
  created_at: string
  updated_at: string
}

type SupabaseRow = Record<string, unknown>

function createSupabaseMock() {
  const rows: UpsertRow[] = []

  function buildChain(table: string) {
    let filters: { column: string; value: unknown }[] = []
    let pendingPayload: Partial<UpsertRow> | null = null

    const chain = {
      select(_columns: string) {
        return chain
      },
      eq(column: string, value: unknown) {
        filters.push({ column, value })
        return chain
      },
      limit(_n: number) {
        return chain
      },
      order(_column: string, _opts?: unknown) {
        return chain
      },
      update(payload: Partial<UpsertRow>) {
        pendingPayload = payload
        return chain
      },
      insert(payload: Partial<UpsertRow> | Partial<UpsertRow>[]) {
        pendingPayload = payload
        return chain
      },
      upsert(payload: Partial<UpsertRow>, _opts?: { onConflict?: string }) {
        pendingPayload = payload
        return chain
      },
      delete() {
        pendingPayload = { direction: '__delete__' }
        return chain
      },
      async then(resolve: (value: { data: SupabaseRow[] | null; error: null }) => void) {
        const matched = rows.filter((row) =>
          filters.every((f) => (row as Record<string, unknown>)[f.column] === f.value)
        )

        if (pendingPayload && pendingPayload.direction === '__delete__') {
          for (const m of matched) {
            const idx = rows.findIndex((r) => r.id === m.id)
            if (idx >= 0) rows.splice(idx, 1)
          }
        } else if (pendingPayload && (pendingPayload as { onConflict?: string }).onConflict === 'id') {
          const payload = pendingPayload as UpsertRow
          const idx = rows.findIndex((r) => r.id === payload.id)
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...payload }
          } else {
            rows.push(payload)
          }
        } else if (pendingPayload && (pendingPayload as { onConflict?: string }).onConflict === undefined) {
          const insertOne = (p: Partial<UpsertRow>) => {
            rows.push({
              id: String(p.id ?? `row-${rows.length + 1}`),
              user_id: String(p.user_id ?? 'user-1'),
              asset_key: String(p.asset_key ?? ''),
              asset_type: String(p.asset_type ?? 'STOCK'),
              market: String(p.market ?? 'A_SHARE'),
              code: String(p.code ?? ''),
              name: String(p.name ?? ''),
              direction: String(p.direction ?? 'BUY'),
              shares: Number(p.shares ?? 0),
              avg_cost: Number(p.avg_cost ?? 0),
              created_at: String(p.created_at ?? new Date().toISOString()),
              updated_at: String(p.updated_at ?? new Date().toISOString())
            })
          }
          if (Array.isArray(pendingPayload)) {
            pendingPayload.forEach(insertOne)
          } else {
            insertOne(pendingPayload)
          }
        } else if (pendingPayload) {
          for (const m of matched) {
            const idx = rows.findIndex((r) => r.id === m.id)
            if (idx >= 0) {
              rows[idx] = { ...rows[idx], ...pendingPayload }
            }
          }
        }

        filters = []
        pendingPayload = null
        resolve({ data: matched as SupabaseRow[], error: null })
      }
    }

    void table
    return chain
  }

  const supabaseMock = {
    from(table: string) {
      return buildChain(table)
    }
  }

  return { supabaseMock, rows }
}

describe('SupabasePortfolioRepository upsert — 无 id 多笔同 assetKey', () => {
  let rows: UpsertRow[]
  let repo: InstanceType<typeof import('@main/repositories/supabasePortfolioRepository')['SupabasePortfolioRepository']>
  let memoryDb: DatabaseSync

  beforeEach(async () => {
    vi.resetModules()

    memoryDb = new DatabaseSync(':memory:')
    memoryDb.exec(`
      CREATE TABLE IF NOT EXISTS portfolio_positions (
        id TEXT PRIMARY KEY,
        asset_key TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        market TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        direction TEXT NOT NULL,
        shares REAL NOT NULL,
        avg_cost REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    vi.doMock('@main/infrastructure/db/sqlite', () => ({
      getDatabase: () => memoryDb,
      getDatabaseFilePathForDebug: () => ':memory:'
    }))

    const { supabaseMock, rows: dataRows } = createSupabaseMock()
    rows = dataRows

    vi.doMock('@main/infrastructure/supabase/supabaseClient', () => ({
      getSupabaseClient: () => supabaseMock,
      resetSupabaseClient: () => {}
    }))

    vi.doMock('@main/infrastructure/supabase/authService', () => ({
      authService: {
        getSession: async () => ({ user: { id: 'user-1' } })
      }
    }))

    vi.doMock('@main/infrastructure/supabase/syncStatusNotifier', () => ({
      notifySyncStatus: () => {}
    }))

    const { SupabasePortfolioRepository } = await import('@main/repositories/supabasePortfolioRepository')
    repo = new SupabasePortfolioRepository()
  })

  it('无 id 连续两次 upsert 同 assetKey，云端应保留两行（不覆盖）', async () => {
    await repo.upsert({
      assetKey: 'FUND:A_SHARE:020602',
      assetType: 'FUND',
      market: 'A_SHARE',
      code: '020602',
      name: '易方达中证红利低波动ETF联接A',
      direction: 'BUY',
      shares: 100,
      avgCost: 1.0
    })

    await repo.upsert({
      assetKey: 'FUND:A_SHARE:020602',
      assetType: 'FUND',
      market: 'A_SHARE',
      code: '020602',
      name: '易方达中证红利低波动ETF联接A',
      direction: 'BUY',
      shares: 200,
      avgCost: 1.1
    })

    const sameKeyRows = rows.filter((r) => r.asset_key === 'FUND:A_SHARE:020602')
    expect(sameKeyRows.length).toBe(2)
    expect(sameKeyRows[0].id).not.toBe(sameKeyRows[1].id)
    expect(sameKeyRows.find((r) => r.shares === 100)).toBeTruthy()
    expect(sameKeyRows.find((r) => r.shares === 200)).toBeTruthy()
  })
})
