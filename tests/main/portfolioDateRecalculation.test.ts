import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNodeSqliteDatabase } from '@main/infrastructure/db/nodeSqliteDatabase'
import type { SqliteDatabase } from '@main/infrastructure/db/databaseTypes'
import type { DividendEvent } from '@main/domain/entities/Stock'
import type { PortfolioPositionUpsertDto } from '@shared/contracts/api'

const assetKey = 'STOCK:A_SHARE:601398'
const firstDividend: DividendEvent = {
  year: 2025, exDate: '2025-06-01', dividendPerShare: 0.5,
  referenceClosePrice: 10, source: 'test', status: 'IMPLEMENTED'
}
const secondDividend: DividendEvent = {
  year: 2025, exDate: '2025-09-01', dividendPerShare: 0.2,
  referenceClosePrice: 10, source: 'test', status: 'IMPLEMENTED'
}

describe('修改买入日期与除权游标的真实SQLite联动', () => {
  let db: SqliteDatabase
  let portfolio: InstanceType<typeof import('@main/repositories/portfolioRepository')['PortfolioRepository']>
  let dividends: InstanceType<typeof import('@main/repositories/dividendRepository')['DividendRepository']>
  let upsert: typeof import('@main/application/useCases/upsertPortfolioPosition')['upsertPortfolioPosition']
  let list: typeof import('@main/application/useCases/listPortfolioPositions')['listPortfolioPositions']

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
    ;({ upsertPortfolioPosition: upsert } = await import('@main/application/useCases/upsertPortfolioPosition'))
    ;({ listPortfolioPositions: list } = await import('@main/application/useCases/listPortfolioPositions'))
    await portfolio.upsert({
      id: 'trade-1', assetKey, assetType: 'STOCK', market: 'A_SHARE', code: '601398',
      name: '工商银行', direction: 'BUY', shares: 100, avgCost: 10.05,
      tradePrice: 10, openedAt: '2025-01-01'
    })
  })

  afterEach(async () => { await db.close() })

  async function changeDate(openedAt?: string, overrides: Partial<PortfolioPositionUpsertDto> = {}) {
    const [position] = await portfolio.list()
    await upsert({ ...position, corporateActionsAppliedUntil: undefined, openedAt, ...overrides })
  }

  it('同一派息区间只改日期不会再次扣息，保留含历史佣金的成本', async () => {
    await dividends.upsertMany(assetKey, [firstDividend])
    expect((await list())[0].avgCost).toBeCloseTo(9.55)
    await changeDate('2025-01-02')
    const [updated] = await list()
    expect(updated.avgCost).toBeCloseTo(9.55)
    expect(updated.tradePrice).toBe(10)
    expect(updated.corporateActionsAppliedUntil).toBe('2025-06-01')
    expect((await list())[0].avgCost).toBeCloseTo(9.55)
  })

  it('旧ISO买入日期规范成同一日历日时保持游标，不把格式变化当成重放信号', async () => {
    await db.prepare('UPDATE portfolio_positions SET opened_at = ?').run('2025-01-01T23:00:00-08:00')
    await dividends.upsertMany(assetKey, [firstDividend])
    expect((await list())[0].avgCost).toBeCloseTo(9.55)
    await changeDate('2025-01-01')
    expect((await list())[0].avgCost).toBeCloseTo(9.55)
  })

  it('仅用旧symbol身份提交的日期编辑也能还原成本', async () => {
    await dividends.upsertMany(assetKey, [firstDividend])
    await list()
    await changeDate('2025-01-02', { assetKey: undefined, assetType: undefined, market: undefined, code: undefined })
    expect((await list())[0].avgCost).toBeCloseTo(9.55)
  })

  it('新买入日在两次派息之间时先还原交易基线，再只扣后一次现金分红', async () => {
    await dividends.upsertMany(assetKey, [firstDividend, secondDividend])
    expect((await list())[0].avgCost).toBeCloseTo(9.35)
    await changeDate('2025-07-01')
    expect((await list())[0].avgCost).toBeCloseTo(9.85)
  })

  it('缺原成交价的已除权旧交易同时改数量与日期时拒绝写入，避免重复扣息', async () => {
    await db.prepare('UPDATE portfolio_positions SET trade_price = NULL').run()
    await dividends.upsertMany(assetKey, [firstDividend])
    await list()
    const [before] = await portfolio.list()
    await expect(changeDate('2025-01-02', { shares: 200 })).rejects.toThrow(/分别修改.*数量.*日期/)
    expect((await portfolio.list())[0]).toEqual(before)
  })

  it('清除买入日期后还原未除权基线，不保留已经扣除的历史分红', async () => {
    await dividends.upsertMany(assetKey, [firstDividend])
    await list()
    await changeDate(undefined)
    const [updated] = await list()
    expect(updated.avgCost).toBeCloseTo(10.05)
    expect(updated.openedAt).toBeUndefined()
    expect(updated.corporateActionsAppliedUntil).toBeUndefined()
  })

  it('现金与送股混合时逆序还原，重放后股数不会再次增加', async () => {
    await dividends.upsertMany(assetKey, [firstDividend, { ...secondDividend, bonusSharePer10: 10 }])
    const [adjusted] = await list()
    expect(adjusted.shares).toBe(200)
    expect(adjusted.avgCost).toBeCloseTo(4.575)
    await changeDate('2025-01-02')
    const [updated] = await list()
    expect(updated.shares).toBe(200)
    expect(updated.avgCost).toBeCloseTo(4.575)
    await changeDate('2025-10-01')
    const [afterAllEvents] = await list()
    expect(afterAllEvents.shares).toBe(100)
    expect(afterAllEvents.avgCost).toBeCloseTo(10.05)
  })

  it('同日的多条除权方案也按应用顺序逆序还原，不交换现金和送股的先后', async () => {
    await dividends.upsertMany(assetKey, [
      { ...firstDividend, announceDate: '2025-05-01' },
      { ...firstDividend, announceDate: '2025-05-02', dividendPerShare: 0.2, bonusSharePer10: 10 }
    ])
    expect((await list())[0].avgCost).toBeCloseTo(4.575)
    await changeDate('2025-07-01')
    const [updated] = await list()
    expect(updated.shares).toBe(100)
    expect(updated.avgCost).toBeCloseTo(10.05)
  })

  it.each(['all', 'cursor'] as const)('缓存缺少%s事件时拒绝修改日期并保持原记录', async (missing) => {
    await dividends.upsertMany(assetKey, [firstDividend, secondDividend])
    await list()
    const [before] = await portfolio.list()
    if (missing === 'all') await db.exec('DELETE FROM dividend_events')
    else await db.prepare('DELETE FROM dividend_events WHERE ex_date = ?').run('2025-09-01')
    await expect(changeDate('2025-01-02')).rejects.toThrow(/分红缓存/)
    expect((await portfolio.list())[0]).toEqual(before)
  })

  it('成本曾被现金分红截断为0时无法逆推，拒绝改日期而不猜历史成本', async () => {
    await dividends.upsertMany(assetKey, [{ ...firstDividend, dividendPerShare: 20 }])
    expect((await list())[0].avgCost).toBe(0)
    const [before] = await portfolio.list()
    await expect(changeDate('2025-01-02')).rejects.toThrow(/成本.*0|零成本/)
    expect((await portfolio.list())[0]).toEqual(before)
  })

  it('用户修改成交价时按输入原始成本重放，不把新成本当成已除权成本逆算', async () => {
    await dividends.upsertMany(assetKey, [firstDividend])
    await list()
    await changeDate('2025-01-02', { avgCost: 11.05, tradePrice: 11, corporateActionsAppliedUntil: undefined })
    expect((await list())[0].avgCost).toBeCloseTo(10.55)
  })

  it('JSON导入显式游标时保留已调整值，后续列表不会重复扣息送股', async () => {
    await dividends.upsertMany(assetKey, [{ ...firstDividend, bonusSharePer10: 10 }])
    const [adjusted] = await list()
    await upsert({ ...adjusted, id: 'imported-1' })
    const imported = (await list()).find((position) => position.id === 'imported-1')!
    expect(imported.shares).toBe(200)
    expect(imported.avgCost).toBeCloseTo(4.525)
    expect(imported.corporateActionsAppliedUntil).toBe('2025-06-01')
  })
})
