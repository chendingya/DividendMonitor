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
  it('旧记录没有成交价时仅修改日期，不把含佣成本再次当作成交价加佣金', () => {
    const result = transactionEditor.calculatePortfolioEditorCost({
      mode: 'edit', initialValues: { shares: 100, avgCost: 10.05, originalAvgCost: 10.05 },
      shares: 100, price: 10.05, commissionRate: 0.0001, minCommission: 5
    })
    expect(result.trueCost).toBe(10.05)
    expect(result.tradePrice).toBeUndefined()
  })

  it('未知成交价的旧记录只改数量仍保留每单位历史成本，不反推未知佣金', () => {
    const result = transactionEditor.calculatePortfolioEditorCost({
      mode: 'edit', initialValues: { shares: 100, avgCost: 10.05, originalAvgCost: 10.05 },
      shares: 200, price: 10.05, commissionRate: 0.0001, minCommission: 5
    })
    expect(result.trueCost).toBe(10.05)
    expect(result.tradePrice).toBeUndefined()
  })

  it('用户主动修改旧记录价格后，按新成交价计算一次佣金', () => {
    const result = transactionEditor.calculatePortfolioEditorCost({
      mode: 'edit', initialValues: { shares: 100, avgCost: 10.05, originalAvgCost: 10.05 },
      shares: 100, price: 11, commissionRate: 0.0001, minCommission: 5
    })
    expect(result.trueCost).toBe(11.05)
    expect(result.tradePrice).toBe(11)
  })

  it('已知成交价且价格数量没改时，即使佣金设置改变也保留原始真实成本', () => {
    const result = transactionEditor.calculatePortfolioEditorCost({
      mode: 'edit', initialValues: { shares: 100, avgCost: 10, originalAvgCost: 10.05, tradePrice: 10 },
      shares: 100, price: 10, commissionRate: 0.0001, minCommission: 8
    })
    expect(result.trueCost).toBe(10.05)
    expect(result.tradePrice).toBe(10)
  })

  it('编辑表单携带历史真实成本及可选成交价，保持两者含义不同', () => {
    const edit = createPortfolioTransactionEdit(row, row.transactions[0])
    expect(edit.initialValues).toMatchObject({ avgCost: 20, originalAvgCost: 20.05, tradePrice: 20 })
  })

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

  it('云端恢复的ISO买入日期保留日历日期，重新编辑时不发生时区偏移', () => {
    const edit = createPortfolioTransactionEdit(row, {
      ...row.transactions[0], openedAt: '2026-10-20T23:00:00-08:00'
    })
    expect(edit.initialValues.openedAt).toBe('2026-10-20')
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
