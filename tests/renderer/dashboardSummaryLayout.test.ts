import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@renderer/pages/DashboardPage'
import type { PortfolioRow } from '@renderer/hooks/usePortfolio'

vi.mock('@renderer/hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const row: PortfolioRow = {
  id: 'pos-1',
  assetKey: 'STOCK:A_SHARE:600900',
  assetType: 'STOCK',
  market: 'A_SHARE',
  code: '600900',
  symbol: '600900',
  name: '长江电力',
  direction: 'BUY',
  shares: 200,
  avgCost: 28.4,
  openedAt: '2026-11-05',
  updatedAt: '2026-11-05T10:00:00.000Z',
  latestPrice: 31.2,
  marketValue: 6240,
  yieldMetric: 0.038,
  yieldLabel: '未来股息率',
  positionReturn: 0.0986,
  netShares: 200,
  transactionCount: 1,
  netCostAmount: 5680,
  transactions: [
    { id: 'tx-1', direction: 'BUY', shares: 200, avgCost: 28.4, openedAt: '2026-11-05', updatedAt: '2026-11-05T10:00:00.000Z' }
  ]
}

vi.mock('@renderer/hooks/usePortfolio', () => ({
  usePortfolio: () => ({
    positions: [],
    rows: [row],
    refreshing: false,
    totalCost: 5680,
    totalValue: 6240,
    totalReturn: 0.0986,
    avgYieldMetric: 0.038,
    opportunities: [],
    recentItems: [],
    refreshQuotes: async () => ({ failed: 0 }),
    reload: async () => {}
  })
}))
vi.mock('@renderer/hooks/usePortfolioRiskMetrics', () => ({
  usePortfolioRiskMetrics: () => ({ data: { portfolioVolatility: 0.142, portfolioSharpeRatio: 0.85, maxDrawdown: 0.121 }, loading: false, error: null })
}))
vi.mock('@renderer/hooks/useIndustryAnalysis', () => ({
  useIndustryAnalysis: () => ({ distribution: [] })
}))
vi.mock('@renderer/hooks/useWatchlistGroups', () => ({
  useWatchlistGroups: () => ({
    groups: [], createGroup: async () => {}, updateGroup: async () => {},
    deleteGroup: async () => {}, addToGroup: async () => {}, removeFromGroup: async () => {}
  })
}))
vi.mock('@renderer/hooks/useHousing', () => ({
  useHousingCities: () => ({
    data: [], loading: false, error: null, reload: async () => {},
    toggleWatch: async () => {}, mutatingCity: null
  })
}))
vi.mock('@renderer/services/watchlistApi', () => ({
  watchlistApi: { getAssetGroupIds: async () => [] }
}))
vi.mock('@renderer/services/dividendApi', () => ({
  dividendApi: {
    getForecast: async () => ({ year: 2026, annualEstimatedTotal: 11820, yearToDateActual: 9340, upcomingPlanned: 0, remainingEstimated: 0, details: { upcoming: [] } }),
    getHistory: async () => ({
      items: [
        { assetKey: 'ETF:A_SHARE:510880', assetName: '红利ETF', code: '510880', year: 2026, exDate: '2026-10-30', dividendPerShare: 0.12, referenceClosePrice: 3.1, heldShares: 10300, estimatedDividendAmount: 1236 }
      ],
      yearlySummary: [], monthlyTrend: [], assetSummary: [], totalAmount: 1236
    })
  }
}))

function renderPage() {
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(DashboardPage)))
}

describe('仪表盘摘要布局', () => {
  it('用摘要条替代大指标卡，并保留隐藏金额开关', () => {
    const html = renderPage()
    expect(html).toContain('dashboard-summary-strip')
    expect(html).toContain('持仓总市值')
    expect(html).toContain('6,240')
    expect(html).toContain('隐藏金额')
    expect(html).not.toContain('ledger-metric-grid')
  })

  it('右侧栏展示按资产类型的配置与真实风险指标', () => {
    const html = renderPage()
    expect(html).toContain('dashboard-side-rail')
    expect(html).toContain('资产配置')
    expect(html).toContain('股票')
    expect(html).toContain('风险指标')
    expect(html).toContain('14.20%')
  })

  it('操作入口按用途分工：侧栏不放按钮，底部保留快捷工具', () => {
    const html = renderPage()
    expect(html).not.toContain('快捷操作')
    expect(html).toContain('快捷工具')
    expect(html).toContain('收益回测工具')
    expect(html).toContain('多股对比')
    expect(html).not.toContain('dashboard-quick-actions')
  })

  it('分布饼图默认只展示行业，其余收进更多分布', () => {
    const html = renderPage()
    expect(html).toContain('持仓结构分布')
    expect(html).toContain('更多分布')
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>更多分布/)
    expect(html).not.toContain('按风险等级')
    expect(html).not.toContain('按自定义分组')
  })

  it('主列包含最近交易卡片，展示持仓交易记录', () => {
    const html = renderPage()
    expect(html).toContain('dashboard-recent-tx')
    expect(html).toContain('最近交易')
    expect(html).toContain('买入')
    expect(html).toContain('2026-11-05')
  })
})