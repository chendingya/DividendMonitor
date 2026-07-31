import { beforeEach, describe, expect, it, vi } from 'vitest'

const { portfolioListMock, upcomingMock, mockPositions, mockEvents } = vi.hoisted(() => ({
  portfolioListMock: vi.fn(),
  upcomingMock: vi.fn(),
  mockPositions: [] as any[],
  mockEvents: [] as any[]
}))

vi.mock('@main/repositories/repositoryFactory', () => ({
  getPortfolioRepository: () => ({
    list: portfolioListMock
  }),
  getDividendRepository: () => ({
    listUpcomingByAssetKeys: upcomingMock
  })
}))

vi.mock('@main/repositories/dividendRepository', () => ({
  DividendRepository: class {
    listUpcomingByAssetKeys = upcomingMock
  }
}))

import { listUpcomingDividends } from '@main/application/useCases/listUpcomingDividends'

describe('listUpcomingDividends', () => {
  beforeEach(() => {
    mockPositions.length = 0
    mockEvents.length = 0
    portfolioListMock.mockReset()
    upcomingMock.mockReset()
    portfolioListMock.mockResolvedValue(mockPositions)
    upcomingMock.mockImplementation((keys: string[], sinceYear?: number) =>
      mockEvents.filter(
        (e) => keys.includes(e.assetKey) && (sinceYear === undefined || e.year >= sinceYear)
      )
    )

    mockPositions.push({
      id: '1',
      assetKey: 'STOCK:A_SHARE:600519',
      assetType: 'STOCK',
      market: 'A_SHARE',
      code: '600519',
      name: '贵州茅台',
      direction: 'BUY',
      shares: 1000,
      avgCost: 1500,
      openedAt: '2023-01-01',
      updatedAt: '2023-01-01',
      createdAt: '2023-01-01'
    })
    mockEvents.push({
      assetKey: 'STOCK:A_SHARE:600519',
      year: 2026,
      fiscalYear: 2026,
      announceDate: '2026-04-15',
      dividendPerShare: 0.5,
      referenceClosePrice: 1500,
      source: 'eastmoney',
      status: 'PLANNED',
      announcementProgress: '董事会预案',
      exDate: undefined,
      payDate: undefined
    })
  })

  it('聚合持仓 + 拉库内 upcoming → 输出估算金额', async () => {
    const result = await listUpcomingDividends()
    expect(result).toHaveLength(1)
    expect(result[0].estimatedAmount).toBe(500)
    expect(result[0].status).toBe('PLANNED')
    expect(result[0].heldShares).toBe(1000)
  })

  it('SELL 持仓净额', async () => {
    mockPositions.push({
      id: '2',
      assetKey: 'STOCK:A_SHARE:600519',
      assetType: 'STOCK',
      market: 'A_SHARE',
      code: '600519',
      name: '贵州茅台',
      direction: 'SELL',
      shares: 200,
      avgCost: 1500,
      openedAt: '2023-08-01',
      updatedAt: '2023-08-01',
      createdAt: '2023-08-01'
    })
    const result = await listUpcomingDividends()
    expect(result).toHaveLength(1)
    expect(result[0].heldShares).toBe(800)
    expect(result[0].estimatedAmount).toBe(400)
  })

  it('持仓数为 0 时跳过估算，输出为空', async () => {
    mockPositions[0] = {
      ...mockPositions[0],
      direction: 'SELL',
      shares: 1000,
      openedAt: '2024-01-01'
    }
    const result = await listUpcomingDividends()
    expect(result).toHaveLength(0)
  })
})