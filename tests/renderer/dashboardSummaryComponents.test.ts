import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DashboardSummaryStrip } from '@renderer/components/dashboard/DashboardSummaryStrip'
import { RecentTransactionsCard } from '@renderer/components/dashboard/RecentTransactionsCard'
import { DashboardSideRail } from '@renderer/components/dashboard/DashboardSideRail'
import { DashboardOpportunities } from '@renderer/components/dashboard/DashboardOpportunities'
import { buildDistributionPieOption } from '@renderer/components/dashboard/PortfolioDistributionPie'
import { buildIndustryPieOption } from '@renderer/components/industry/IndustryDistributionPie'
import { buildSummaryCells, type RecentTransactionItem } from '@renderer/pages/dashboardSummary'

vi.mock('@renderer/hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const cells = buildSummaryCells({
  totalValue: 243180,
  totalCost: 216340,
  totalReturn: 0.124,
  avgYieldMetric: 0.0486,
  rowCount: 5,
  forecast: { year: 2026, annualEstimatedTotal: 11820, yearToDateActual: 9340 }
})

function renderStrip(hideAmounts: boolean) {
  return renderToStaticMarkup(createElement(DashboardSummaryStrip, {
    cells, hideAmounts, onToggleHideAmounts: () => {}
  }))
}

describe('DashboardSummaryStrip', () => {
  it('渲染四格摘要与金额隐藏开关', () => {
    const html = renderStrip(false)
    for (const label of ['持仓总市值', '投入成本', '年度分红（预估）', '加权收益指标']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('243,180')
    expect(html).toContain('11,820')
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>/)
    expect(html).toContain('隐藏金额')
  })

  it('隐藏模式下所有金额与百分比被遮蔽但标签保留', () => {
    const html = renderStrip(true)
    expect(html).toContain('持仓总市值')
    expect(html).not.toContain('243,180')
    expect(html).not.toContain('11,820')
    expect(html).not.toContain('4.86%')
    expect(html).toContain('∗')
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>/)
    expect(html).toContain('显示金额')
  })
})

const txItems: RecentTransactionItem[] = [
  { id: 'tx-1', date: '2026-11-05', kind: 'BUY', assetName: '长江电力', code: '600900', amount: 5680, detail: '200 股 @ 28.4' },
  { id: 'div-1', date: '2026-10-30', kind: 'DIVIDEND', assetName: '红利ETF', code: '510880', amount: 1236, detail: '现金分红' },
  { id: 'tx-2', date: '2026-10-22', kind: 'SELL', assetName: '沪深300ETF', code: '510300', amount: 2050, detail: '500 股 @ 4.1' }
]

describe('RecentTransactionsCard', () => {
  it('展示日期/标的/类型与带符号金额', () => {
    const html = renderToStaticMarkup(createElement(RecentTransactionsCard, { items: txItems, hideAmounts: false }))
    expect(html).toContain('最近交易')
    expect(html).toContain('2026-11-05')
    expect(html).toContain('长江电力')
    expect(html).toContain('买入')
    expect(html).toContain('分红')
    expect(html).toContain('卖出')
    expect(html).toMatch(/[-−]¥5,680/)
    expect(html).toContain('+¥1,236')
    expect(html).toContain('+¥2,050')
  })

  it('隐藏模式下金额与交易明细数字被遮蔽', () => {
    const html = renderToStaticMarkup(createElement(RecentTransactionsCard, { items: txItems, hideAmounts: true }))
    expect(html).not.toContain('5,680')
    expect(html).not.toContain('200 股 @ 28.4')
    expect(html).toContain('长江电力')
    expect(html).toContain('∗')
  })

  it('空列表显示占位状态', () => {
    const html = renderToStaticMarkup(createElement(RecentTransactionsCard, { items: [], hideAmounts: false }))
    expect(html).toContain('暂无交易记录')
  })
})

const railProps = {
  slices: [
    { name: '股票', value: 116700, color: '#0052d0' },
    { name: 'ETF', value: 72950, color: '#5b8def' }
  ],
  riskMetrics: { portfolioVolatility: 0.142, portfolioSharpeRatio: 0.85, maxDrawdown: 0.121 }
}

describe('DashboardSideRail', () => {
  it('展示配置图例与风险指标', () => {
    const html = renderToStaticMarkup(createElement(DashboardSideRail, { ...railProps, hideAmounts: false }))
    expect(html).toContain('资产配置')
    expect(html).toContain('股票')
    expect(html).toContain('116,700')
    expect(html).toContain('风险指标')
    expect(html).toContain('14.20%')
    expect(html).toContain('0.85')
    expect(html).toContain('12.10%')
  })

  it('隐藏模式下配置金额与风险数值被遮蔽', () => {
    const html = renderToStaticMarkup(createElement(DashboardSideRail, { ...railProps, hideAmounts: true }))
    expect(html).not.toContain('116,700')
    expect(html).not.toContain('14.20%')
    expect(html).toContain('∗')
  })

  it('风险数据缺失时显示占位符', () => {
    const html = renderToStaticMarkup(createElement(DashboardSideRail, { ...railProps, riskMetrics: null, hideAmounts: false }))
    expect(html).toContain('风险指标')
    expect(html).toContain('--')
  })

  it('不再承载操作按钮，动作由顶部与底部工具区承担', () => {
    const html = renderToStaticMarkup(createElement(DashboardSideRail, { ...railProps, hideAmounts: false }))
    for (const action of ['刷新估值', '导出报告', '股息回测', '估值对比', '快捷操作']) {
      expect(html).not.toContain(action)
    }
  })
})

const opportunity = {
  id: 'pos-1',
  assetKey: 'STOCK:A_SHARE:600900',
  assetType: 'STOCK',
  market: 'A_SHARE',
  code: '600900',
  symbol: '600900',
  name: '长江电力',
  direction: 'BUY' as const,
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
  transactions: [],
  displayCode: '600900'
}

describe('DashboardOpportunities 金额隐藏', () => {
  it('默认展示收益率', () => {
    const html = renderToStaticMarkup(createElement(DashboardOpportunities, {
      opportunities: [opportunity], onGoToDetail: () => {}
    }))
    expect(html).toContain('长江电力')
    expect(html).toContain('3.80%')
  })

  it('隐藏模式下收益率被遮蔽但资产名称保留', () => {
    const html = renderToStaticMarkup(createElement(DashboardOpportunities, {
      opportunities: [opportunity], onGoToDetail: () => {}, hideAmounts: true
    }))
    expect(html).toContain('长江电力')
    expect(html).not.toContain('3.80%')
    expect(html).toContain('∗')
  })
})

describe('饼图金额隐藏', () => {
  const slices = [{ name: '股票', value: 100, color: '#0052d0' }, { name: 'ETF', value: 100, color: '#5b8def' }]

  it('PortfolioDistributionPie 隐藏时 tooltip 不含金额', () => {
    const option = buildDistributionPieOption(slices, true) as { tooltip: { formatter: (p: { name: string; value: number; percent: number }) => string } }
    const text = option.tooltip.formatter({ name: '股票', value: 100, percent: 50 })
    expect(text).toContain('股票')
    expect(text).toContain('50')
    expect(text).not.toContain('100')
    const shown = buildDistributionPieOption(slices, false) as typeof option
    expect(shown.tooltip.formatter({ name: '股票', value: 100, percent: 50 })).toContain('100')
  })

  it('IndustryDistributionPie 隐藏时 tooltip 不含金额', () => {
    const option = buildIndustryPieOption([{ industryName: '银行', totalValue: 500 } as never], true) as { tooltip: { formatter: (p: { name: string; value: number; percent: number }) => string } }
    const text = option.tooltip.formatter({ name: '银行', value: 500, percent: 100 })
    expect(text).toContain('银行')
    expect(text).not.toContain('500')
  })
})