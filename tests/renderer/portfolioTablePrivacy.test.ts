import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PortfolioTable } from '@renderer/components/dashboard/PortfolioTable'
import type { PortfolioRow } from '@renderer/hooks/usePortfolio'

const viewport = vi.hoisted(() => ({ mobile: false }))
vi.mock('@renderer/hooks/useIsMobile', () => ({ useIsMobile: () => viewport.mobile }))

function createRow(): PortfolioRow {
  return {
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
}

function renderTable(hideAmounts: boolean) {
  return renderToStaticMarkup(createElement(PortfolioTable, {
    rows: [createRow()],
    groups: [],
    getAssetGroupIds: async () => [],
    onToggleAssetGroup: async () => {},
    onGoToDetail: () => {},
    onEdit: () => {},
    onRemove: () => {},
    hideAmounts
  }))
}

describe('持仓表金额隐藏', () => {
  it('默认展示金额', () => {
    viewport.mobile = false
    const html = renderTable(false)
    expect(html).toContain('28.4')
    expect(html).toContain('6,240')
    expect(html).toContain('长江电力')
  })

  it('桌面隐藏模式遮蔽价格/市值/百分比但保留资产名称', () => {
    viewport.mobile = false
    const html = renderTable(true)
    expect(html).toContain('长江电力')
    expect(html).not.toContain('6,240')
    expect(html).not.toContain('9.86%')
    expect(html).not.toContain('3.80%')
    expect(html).toContain('∗')
  })

  it('手机卡片视图同样遮蔽金额', () => {
    viewport.mobile = true
    const html = renderTable(true)
    expect(html).toContain('长江电力')
    expect(html).not.toContain('6,240')
    expect(html).not.toContain('9.86%')
    expect(html).toContain('∗')
  })
})