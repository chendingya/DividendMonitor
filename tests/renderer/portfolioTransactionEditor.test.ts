import { describe, expect, it } from 'vitest'
import type { PortfolioRow } from '@renderer/hooks/usePortfolio'
import * as transactionEditor from '@renderer/components/dashboard/portfolioTransactionEditor'

const { createPortfolioTransactionEdit } = transactionEditor

const row: PortfolioRow = {
  id: 'buy-2', assetKey: 'STOCK:A_SHARE:601398', assetType: 'STOCK', market: 'A_SHARE',
  code: '601398', symbol: '601398', name: '工商银行', direction: 'BUY', shares: 200,
  netShares: 200, avgCost: 15.05, tradePrice: 20, updatedAt: '2026-10-27',
  transactionCount: 2, netCostAmount: 3010, riskLevel: 'LOW', openedAt: '2026-10-01',
  transactions: [
    { id: 'buy-2', direction: 'BUY', shares: 100, avgCost: 20.05, tradePrice: 20, openedAt: '2026-10-20', updatedAt: '2026-10-27' },
    { id: 'buy-1', direction: 'BUY', shares: 100, avgCost: 10.05, tradePrice: 10, openedAt: '2026-10-01', updatedAt: '2026-10-01' }
  ]
}

describe('持仓编辑交易映射', () => {
  it('两笔各 100 股时仅编辑所选交易的 100 股，不用聚合 200 股覆盖一笔', () => {
    const edit = createPortfolioTransactionEdit(row, row.transactions[0])
    expect(edit.id).toBe('buy-2')
    expect(edit.initialValues.shares).toBe(100)
    expect(edit.initialValues.avgCost).toBe(20)
    expect(edit.initialValues.openedAt).toBe('2026-10-20')
  })

  it('展开编辑卖出交易时保留该笔的方向、数量和日期', () => {
    const edit = createPortfolioTransactionEdit(row, {
      id: 'sell-1', direction: 'SELL', shares: 25, avgCost: 21.2,
      tradePrice: 21, openedAt: '2026-10-25', updatedAt: '2026-10-27', riskLevel: 'MEDIUM'
    })
    expect(edit).toMatchObject({
      id: 'sell-1',
      initialValues: {
        direction: 'SELL', shares: 25, avgCost: 21, openedAt: '2026-10-25',
        assetKey: 'STOCK:A_SHARE:601398', name: '工商银行', riskLevel: 'MEDIUM'
      }
    })
  })

  it('编辑旧交易保留该笔低风险，不使用聚合行最新交易的高风险', () => {
    const edit = createPortfolioTransactionEdit({ ...row, riskLevel: 'HIGH' }, {
      ...row.transactions[1], riskLevel: 'LOW'
    })
    expect(edit.initialValues.riskLevel).toBe('LOW')
  })

  it('选中未指定风险的交易时，不继承聚合行风险', () => {
    const edit = createPortfolioTransactionEdit({ ...row, riskLevel: 'HIGH' }, row.transactions[1])
    expect(edit.initialValues.riskLevel).toBeUndefined()
  })

  it.each([
    { riskLevel: 'LOW' as const, want: 'LOW' },
    { riskLevel: undefined, want: undefined }
  ])('编辑提交按表单 riskLevel=$riskLevel 保存，允许清空旧风险', ({ riskLevel, want }) => {
    const request = transactionEditor.createPortfolioPositionEditRequest({ ...row, riskLevel: 'HIGH' }, {
      name: '工商银行', direction: 'BUY', shares: 100, avgCost: 10.05, tradePrice: 10,
      riskLevel
    })
    expect(request).toMatchObject({ id: 'buy-2', shares: 100, avgCost: 10.05 })
    expect(request.riskLevel).toBe(want)
  })
})
