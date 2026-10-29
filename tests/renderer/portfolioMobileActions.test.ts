import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PortfolioTable } from '@renderer/components/dashboard/PortfolioTable'
import type { PortfolioRow } from '@renderer/hooks/usePortfolio'

vi.mock('@renderer/hooks/useIsMobile', () => ({ useIsMobile: () => true }))

const row: PortfolioRow = {
  id: 'buy-1', assetKey: 'STOCK:A_SHARE:601398', assetType: 'STOCK', market: 'A_SHARE',
  code: '601398', name: '工商银行', direction: 'BUY', shares: 100, netShares: 100,
  avgCost: 10.05, tradePrice: 10, updatedAt: '2026-10-27', transactionCount: 1, netCostAmount: 1005,
  transactions: [{ id: 'buy-1', direction: 'BUY', shares: 100, avgCost: 10.05, tradePrice: 10, updatedAt: '2026-10-27' }]
}

function renderRows(rows: PortfolioRow[]) {
  return renderToStaticMarkup(createElement(PortfolioTable, {
    rows, groups: [], getAssetGroupIds: async () => [], onToggleAssetGroup: async () => {},
    onGoToDetail: () => {}, onEdit: () => {}, onRemove: () => {},
    onEditTransaction: () => {}, onRemoveTransaction: () => {}
  }))
}

describe('手机持仓操作入口', () => {
  it('单笔持仓使用卡片呈现详情、编辑和删除操作，不沿用宽表操作列', () => {
    const html = renderRows([row])
    expect(html).toContain('data-testid="portfolio-mobile-list"')
    expect(html).toContain('aria-label="查看详情 工商银行"')
    expect(html).toContain('aria-label="编辑持仓 工商银行"')
    expect(html).toContain('aria-label="删除持仓 工商银行"')
    expect(html).toContain('title="管理分组"')
  })

  it('多笔持仓提供交易明细和逐笔编辑入口，避免对聚合份额直接保存', () => {
    const html = renderRows([{ ...row, shares: 200, netShares: 200, transactionCount: 2,
      transactions: [row.transactions[0], { ...row.transactions[0], id: 'buy-2' }] }])
    expect(html).toContain('aria-label="交易明细 工商银行"')
    expect(html).toContain('aria-label="编辑此笔 buy-1"')
    expect(html).toContain('aria-label="编辑此笔 buy-2"')
    expect(html).not.toContain('aria-label="编辑持仓 工商银行"')
  })
})
