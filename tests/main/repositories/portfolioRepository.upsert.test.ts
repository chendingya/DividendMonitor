import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createPortfolioPositionsTable = `
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
  CREATE INDEX IF NOT EXISTS idx_portfolio_positions_updated_at
    ON portfolio_positions(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_portfolio_positions_asset_identity
    ON portfolio_positions(asset_key, updated_at DESC);
`

let memoryDb: DatabaseSync

vi.mock('@main/infrastructure/db/sqlite', () => ({
  getDatabase: () => memoryDb,
  getDatabaseFilePathForDebug: () => ':memory:'
}))

const { PortfolioRepository } = await import('@main/repositories/portfolioRepository')

describe('PortfolioRepository upsert — 同 assetKey 多笔新增', () => {
  let repo: InstanceType<typeof PortfolioRepository>

  beforeEach(() => {
    memoryDb = new DatabaseSync(':memory:')
    memoryDb.exec(createPortfolioPositionsTable)
    repo = new PortfolioRepository()
  })

  it('无 id 连续两次 upsert 同一 assetKey，list 应返回 2 行', async () => {
    await repo.upsert({
      assetKey: 'STOCK:A_SHARE:600519',
      assetType: 'STOCK',
      market: 'A_SHARE',
      code: '600519',
      name: '贵州茅台',
      direction: 'BUY',
      shares: 100,
      avgCost: 1500
    })

    await repo.upsert({
      assetKey: 'STOCK:A_SHARE:600519',
      assetType: 'STOCK',
      market: 'A_SHARE',
      code: '600519',
      name: '贵州茅台',
      direction: 'BUY',
      shares: 200,
      avgCost: 1600
    })

    const list = await repo.list()
    expect(list.length).toBe(2)

    const sameKeyRows = list.filter((row) => row.assetKey === 'STOCK:A_SHARE:600519')
    expect(sameKeyRows.length).toBe(2)
    expect(sameKeyRows[0].id).not.toBe(sameKeyRows[1].id)
  })
})
