import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { portfolioApiMock } = vi.hoisted(() => ({
  portfolioApiMock: {
    list: vi.fn(),
    upsert: vi.fn(),
    remove: vi.fn(),
    removeByAsset: vi.fn(),
    replaceByAsset: vi.fn()
  }
}))

vi.mock('@renderer/services/portfolioApi', () => ({
  portfolioApi: portfolioApiMock
}))

import {
  listPortfolioPositionsFromBackend,
  readPortfolioPositions,
  upsertPortfolioPosition,
  upsertPortfolioPositionInBackend
} from '@renderer/services/portfolioStore'

class MemoryStorage {
  private store = new Map<string, string>()

  getItem(key: string) {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  clear() {
    this.store.clear()
  }
}

describe('portfolioStore', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    ;(globalThis as typeof globalThis & { window: { localStorage: MemoryStorage } }).window = {
      localStorage: storage
    }
    portfolioApiMock.list.mockReset()
    portfolioApiMock.upsert.mockReset()
    portfolioApiMock.remove.mockReset()
    portfolioApiMock.removeByAsset.mockReset()
    portfolioApiMock.replaceByAsset.mockReset()
  })

  afterEach(() => {
    delete (globalThis as typeof globalThis & { window?: { localStorage: MemoryStorage } }).window
  })

  const adjusted = {
    id: 'adjusted-1', assetKey: 'ETF:A_SHARE:510880', assetType: 'ETF' as const, market: 'A_SHARE' as const,
    code: '510880', name: '红利ETF', direction: 'BUY' as const, shares: 1100, avgCost: 2.1,
    tradePrice: 2.5, openedAt: '2026-10-20', corporateActionsAppliedUntil: '2026-10-25',
    updatedAt: '2026-10-30', createdAt: '2026-10-20'
  }

  it('从后端读取已调整持仓时保留除权游标，供JSON备份使用', async () => {
    portfolioApiMock.list.mockResolvedValue([adjusted])
    const result = await listPortfolioPositionsFromBackend()
    expect(result[0]).toMatchObject({ shares: 1100, avgCost: 2.1, corporateActionsAppliedUntil: '2026-10-25' })
  })

  it('导入已调整持仓写入后端时透传游标，不只写已调整后的数量和成本', async () => {
    portfolioApiMock.upsert.mockResolvedValue(undefined)
    await upsertPortfolioPositionInBackend(adjusted)
    expect(portfolioApiMock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      shares: 1100, avgCost: 2.1, corporateActionsAppliedUntil: '2026-10-25'
    }))
  })

  it('本地持仓保存与读取保留已应用游标', () => {
    upsertPortfolioPosition(adjusted)
    expect(readPortfolioPositions()[0]).toMatchObject({ shares: 1100, avgCost: 2.1, corporateActionsAppliedUntil: '2026-10-25' })
  })

  it('迁移本地已调整持仓到后端时传递除权游标', async () => {
    storage.setItem('dm:portfolio-positions', JSON.stringify([adjusted]))
    portfolioApiMock.upsert.mockResolvedValue(undefined)
    portfolioApiMock.list.mockResolvedValue([])
    await listPortfolioPositionsFromBackend()
    expect(portfolioApiMock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      shares: 1100, avgCost: 2.1, corporateActionsAppliedUntil: '2026-10-25'
    }))
  })

  it('hydrates legacy local positions with derived stock asset identity', () => {
    storage.setItem(
      'dm:portfolio-positions',
      JSON.stringify([
        {
          id: 'legacy-1',
          symbol: '600519',
          name: '贵州茅台',
          direction: 'BUY',
          shares: 100,
          avgCost: 1680,
          updatedAt: '2026-04-26T00:00:00.000Z'
        }
      ])
    )

    expect(readPortfolioPositions()).toEqual([
      {
        id: 'legacy-1',
        assetKey: 'STOCK:A_SHARE:600519',
        assetType: 'STOCK',
        market: 'A_SHARE',
        code: '600519',
        symbol: '600519',
        name: '贵州茅台',
        direction: 'BUY',
        shares: 100,
        avgCost: 1680,
        updatedAt: '2026-04-26T00:00:00.000Z'
      }
    ])
  })

  it('keeps explicit non-stock asset identity when saving local positions', () => {
    upsertPortfolioPosition({
      id: 'etf-1',
      assetKey: 'ETF:A_SHARE:510300',
      assetType: 'ETF',
      market: 'A_SHARE',
      code: '510300',
      name: '沪深300ETF',
      direction: 'BUY',
      shares: 1000,
      avgCost: 4.8
    })

    expect(readPortfolioPositions()).toEqual([
      expect.objectContaining({
        id: 'etf-1',
        assetKey: 'ETF:A_SHARE:510300',
        assetType: 'ETF',
        market: 'A_SHARE',
        code: '510300',
        symbol: undefined,
        name: '沪深300ETF',
        shares: 1000,
        avgCost: 4.8
      })
    ])
  })

  it('maps backend dto asset identity for comparison consumers', async () => {
    portfolioApiMock.list.mockResolvedValue([
      {
        id: 'backend-1',
        assetKey: 'ETF:A_SHARE:510300',
        assetType: 'ETF',
        market: 'A_SHARE',
        code: '510300',
        name: '沪深300ETF',
        direction: 'BUY',
        shares: 2000,
        avgCost: 4.75,
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z'
      }
    ])

    await expect(listPortfolioPositionsFromBackend()).resolves.toEqual([
      {
        id: 'backend-1',
        assetKey: 'ETF:A_SHARE:510300',
        assetType: 'ETF',
        market: 'A_SHARE',
        code: '510300',
        symbol: undefined,
        name: '沪深300ETF',
        direction: 'BUY',
        shares: 2000,
        avgCost: 4.75,
        updatedAt: '2026-04-26T00:00:00.000Z'
      }
    ])
  })

  it('sends asset identity fields when writing non-stock positions to backend', async () => {
    portfolioApiMock.upsert.mockResolvedValue(undefined)

    await upsertPortfolioPositionInBackend({
      id: '',
      assetKey: 'ETF:A_SHARE:510880',
      assetType: 'ETF',
      market: 'A_SHARE',
      code: '510880',
      name: '红利ETF',
      direction: 'BUY',
      shares: 1500,
      avgCost: 1.23
    })

    expect(portfolioApiMock.upsert).toHaveBeenCalledWith({
      id: undefined,
      assetKey: 'ETF:A_SHARE:510880',
      assetType: 'ETF',
      market: 'A_SHARE',
      code: '510880',
      symbol: undefined,
      name: '红利ETF',
      direction: 'BUY',
      shares: 1500,
      avgCost: 1.23
    })
  })
})
