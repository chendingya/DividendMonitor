import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNodeSqliteDatabase } from '@main/infrastructure/db/nodeSqliteDatabase'
import type { SqliteDatabase } from '@main/infrastructure/db/databaseTypes'
import type { DividendEvent } from '@main/domain/entities/Stock'

const assetKey = 'STOCK:A_SHARE:601398'
const event: DividendEvent = {
  year: 2025, exDate: '2025-07-01', dividendPerShare: 0.2,
  referenceClosePrice: 5, source: 'test', status: 'IMPLEMENTED'
}

describe('持仓读取与行情补全分离', () => {
  let db: SqliteDatabase
  let portfolio: InstanceType<typeof import('@main/repositories/portfolioRepository')['PortfolioRepository']>
  let dividends: InstanceType<typeof import('@main/repositories/dividendRepository')['DividendRepository']>
  let listPositions: typeof import('@main/application/useCases/listPortfolioPositions')['listPortfolioPositions']
  let applyActions: typeof import('@main/application/useCases/applyCorporateActionsToPositions')['applyCorporateActionsToPositions']
  let fetchDetail: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    db = createNodeSqliteDatabase(new DatabaseSync(':memory:'))
    await db.exec(`
      CREATE TABLE portfolio_positions (
        id TEXT PRIMARY KEY, asset_key TEXT NOT NULL, asset_type TEXT NOT NULL, market TEXT NOT NULL,
        code TEXT NOT NULL, name TEXT NOT NULL, direction TEXT NOT NULL, shares REAL NOT NULL,
        avg_cost REAL NOT NULL, trade_price REAL, opened_at TEXT, risk_level TEXT,
        corporate_actions_applied_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE dividend_events (
        asset_key TEXT NOT NULL, year INTEGER NOT NULL, fiscal_year INTEGER NOT NULL,
        announce_date TEXT NOT NULL, record_date TEXT, ex_date TEXT, pay_date TEXT,
        dividend_per_share REAL NOT NULL, total_dividend_amount REAL, payout_ratio REAL,
        reference_close_price REAL NOT NULL, bonus_share_per10 REAL, transfer_share_per10 REAL,
        source TEXT NOT NULL, fetched_at TEXT NOT NULL, status TEXT NOT NULL, announcement_progress TEXT,
        UNIQUE(asset_key, announce_date, fiscal_year)
      );
    `)
    vi.doMock('@main/infrastructure/db/sqlite', () => ({ getDatabase: () => db }))
    const { PortfolioRepository } = await import('@main/repositories/portfolioRepository')
    const { DividendRepository } = await import('@main/repositories/dividendRepository')
    portfolio = new PortfolioRepository()
    dividends = new DividendRepository()
    vi.doMock('@main/repositories/repositoryFactory', () => ({
      getPortfolioRepository: () => portfolio, getDividendRepository: () => dividends
    }))
    fetchDetail = vi.fn(() => new Promise(() => {}))
    vi.doMock('@main/repositories/assetRepository', () => ({
      AssetRepository: class { getDetail = fetchDetail }
    }))
    ;({ listPortfolioPositions: listPositions } = await import('@main/application/useCases/listPortfolioPositions'))
    ;({ applyCorporateActionsToPositions: applyActions } = await import('@main/application/useCases/applyCorporateActionsToPositions'))
    await portfolio.upsert({
      id: 'trade-1', assetKey, assetType: 'STOCK', market: 'A_SHARE', code: '601398',
      name: '工商银行', direction: 'BUY', shares: 100, avgCost: 5, openedAt: '2025-01-01'
    })
  })

  afterEach(async () => { await db.close() })

  it('分红未缓存且行情请求一直未完成时，仍立即返回已保存持仓', async () => {
    let result: Awaited<ReturnType<typeof listPositions>> | undefined
    void listPositions().then(items => { result = items })
    await vi.waitFor(() => expect(result).toHaveLength(1), { timeout: 200, interval: 5 })
    expect(result![0]).toMatchObject({ id: 'trade-1', shares: 100, avgCost: 5 })
    expect(fetchDetail).not.toHaveBeenCalled()
  })

  it('已有缓存分红仍先应用会计调整，再返回持仓且不会重复扣减', async () => {
    await dividends.upsertMany(assetKey, [event])
    expect((await listPositions())[0]).toMatchObject({ shares: 100, avgCost: 4.8, corporateActionsAppliedUntil: '2025-07-01' })
    expect((await listPositions())[0].avgCost).toBe(4.8)
    expect(fetchDetail).not.toHaveBeenCalled()
  })

  it('行情补全落库后重新读取会应用新分红，不再保持首次读取的旧成本', async () => {
    let result: Awaited<ReturnType<typeof listPositions>> | undefined
    void listPositions().then(items => { result = items })
    await vi.waitFor(() => expect(result?.[0].avgCost).toBe(5), { timeout: 200, interval: 5 })
    await dividends.upsertMany(assetKey, [event])
    expect((await listPositions())[0].avgCost).toBe(4.8)
  })

  it('显式除权入口默认仍抓取缺失分红并应用，不改变原有补全行为', async () => {
    fetchDetail.mockImplementation(async () => { await dividends.upsertMany(assetKey, [event]) })
    expect(await applyActions()).toHaveLength(1)
    expect(fetchDetail).toHaveBeenCalledWith({ assetKey }, true)
    expect((await portfolio.list())[0].avgCost).toBe(4.8)
  })
})
