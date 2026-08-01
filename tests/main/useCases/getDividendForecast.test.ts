import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  listUpcomingMock,
  listHistoryMock,
  futureYieldMock,
  portfolioListMock,
  mockUpcoming,
  mockHistory,
  mockFutureYield,
  mockPositions
} = vi.hoisted(() => ({
  listUpcomingMock: vi.fn(),
  listHistoryMock: vi.fn(),
  futureYieldMock: vi.fn(),
  portfolioListMock: vi.fn(),
  mockUpcoming: [] as any[],
  mockHistory: {} as any,
  mockFutureYield: {} as any,
  mockPositions: [] as any[]
}))

vi.mock('@main/application/useCases/listUpcomingDividends', () => ({
  listUpcomingDividends: listUpcomingMock
}))
vi.mock('@main/application/useCases/listDividendHistory', () => ({
  listDividendHistory: listHistoryMock
}))
vi.mock('@main/application/useCases/estimateFutureYieldForAsset', () => ({
  estimateFutureYieldForAsset: futureYieldMock
}))
vi.mock('@main/repositories/repositoryFactory', () => ({
  getPortfolioRepository: () => ({
    list: portfolioListMock
  })
}))

import { getDividendForecast } from '@main/application/useCases/getDividendForecast'

describe('getDividendForecast', () => {
  beforeEach(() => {
    listUpcomingMock.mockReset()
    listHistoryMock.mockReset()
    futureYieldMock.mockReset()
    portfolioListMock.mockReset()

    mockUpcoming.length = 0
    mockUpcoming.push({
      assetKey: 'STOCK:A_SHARE:600519',
      assetType: 'STOCK',
      code: '600519',
      name: '贵州茅台',
      heldShares: 1000,
      year: 2026,
      announceDate: undefined,
      dividendPerShare: 0.5,
      announcementProgress: '董事会预案',
      status: 'PLANNED',
      estimatedAmount: 500
    })

    mockHistory.items = []
    mockHistory.yearlySummary = [{ year: 2026, totalAmount: 1200, eventCount: 1, assetCount: 1 }]
    mockHistory.monthlyTrend = []
    mockHistory.assetSummary = []
    mockHistory.totalAmount = 1200

    mockFutureYield.estimates = [
      {
        method: 'baseline',
        estimatedDividendPerShare: 0.5,
        estimatedFutureYield: 0.03,
        isAvailable: true,
        reason: undefined,
        inputs: {},
        steps: []
      }
    ]

    mockPositions.length = 0
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

    listUpcomingMock.mockResolvedValue(mockUpcoming)
    listHistoryMock.mockResolvedValue(mockHistory)
    futureYieldMock.mockResolvedValue(mockFutureYield)
    portfolioListMock.mockResolvedValue(mockPositions)
  })

  it('全年估算 = Σ持仓×每股 baseline 息；待入账/已派取自 history/upcoming', async () => {
    const result = await getDividendForecast(2026)
    expect(result.year).toBe(2026)
    expect(result.upcomingPlanned).toBe(500)
    expect(result.yearToDateActual).toBe(1200)
    expect(result.annualEstimatedTotal).toBe(500)
    expect(result.remainingEstimated).toBe(0)
  })

  it('futureYield 不可用时该资产跳过估算，年总估算为 0', async () => {
    mockFutureYield.estimates = [
      {
        method: 'baseline',
        estimatedDividendPerShare: 0,
        estimatedFutureYield: 0,
        isAvailable: false,
        reason: 'no data',
        inputs: {},
        steps: []
      }
    ]
    const result = await getDividendForecast(2026)
    expect(result.annualEstimatedTotal).toBe(0)
    expect(result.remainingEstimated).toBe(0)
  })

  it('多资产并行估算，单资产失败不影响其它资产', async () => {
    mockPositions.length = 0
    mockPositions.push(
      {
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
      },
      {
        id: '2',
        assetKey: 'STOCK:A_SHARE:000001',
        assetType: 'STOCK',
        market: 'A_SHARE',
        code: '000001',
        name: '平安银行',
        direction: 'BUY',
        shares: 2000,
        avgCost: 12,
        openedAt: '2023-01-01',
        updatedAt: '2023-01-01',
        createdAt: '2023-01-01'
      }
    )
    futureYieldMock.mockImplementation((query: { code: string }) =>
      query.code === '600519'
        ? Promise.resolve(mockFutureYield)
        : Promise.reject(new Error('network error'))
    )

    const result = await getDividendForecast(2026)
    expect(result.annualEstimatedTotal).toBe(500)
  })

  it('无公告日的预案事件按 year 归入当年，跨年不重复计入', async () => {
    mockUpcoming.length = 0
    mockUpcoming.push(
      {
        assetKey: 'STOCK:A_SHARE:600519',
        assetType: 'STOCK',
        code: '600519',
        name: '贵州茅台',
        heldShares: 1000,
        year: 2026,
        announceDate: '2026-03-28',
        dividendPerShare: 0.5,
        announcementProgress: '预案',
        status: 'PLANNED',
        estimatedAmount: 500
      },
      {
        assetKey: 'ETF:A_SHARE:510300',
        assetType: 'ETF',
        code: '510300',
        name: '沪深300ETF',
        heldShares: 100,
        year: 2025,
        announceDate: undefined,
        dividendPerShare: 0.1,
        announcementProgress: '预案',
        status: 'PLANNED',
        estimatedAmount: 10
      }
    )

    const result = await getDividendForecast(2026)
    expect(result.upcomingPlanned).toBe(500)
    expect(result.details.upcoming.length).toBe(1)
  })
})