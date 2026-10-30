import { describe, expect, it } from 'vitest'
import type { PortfolioPosition } from '@renderer/services/portfolioStore'
import { deserializePortfolioPositions, serializePortfolioPositions } from '@renderer/components/dashboard/portfolioPositionTransfer'
import { calculatePortfolioEditorCost } from '@renderer/components/dashboard/portfolioTransactionEditor'

const position: PortfolioPosition = {
  id: 'etf-buy', assetKey: 'ETF:A_SHARE:510880', assetType: 'ETF', market: 'A_SHARE', code: '510880',
  name: '红利ETF', direction: 'BUY', shares: 1000, avgCost: 2.505, tradePrice: 2.5,
  openedAt: '2026-10-20', riskLevel: 'LOW', updatedAt: '2026-10-30'
}

describe('持仓JSON导入导出', () => {
  it('已除权的数量和成本与游标一起往返，防止恢复后重复除权', () => {
    const adjusted = { ...position, shares: 1100, avgCost: 2.1, corporateActionsAppliedUntil: '2026-10-25' }
    const restored = deserializePortfolioPositions(serializePortfolioPositions([adjusted]))[0]
    expect(restored).toMatchObject({ shares: 1100, avgCost: 2.1, openedAt: '2026-10-20', corporateActionsAppliedUntil: '2026-10-25' })
  })

  it('导入的游标日期非法时拒绝恢复，不静默丢游标导致再次除权', () => {
    const text = JSON.stringify([{ ...position, corporateActionsAppliedUntil: '2026-02-30' }])
    expect(() => deserializePortfolioPositions(text)).toThrow('除权除息游标日期无效')
  })

  it('旧ISO游标恢复为原日历日期，不因时区换算向后跨一天', () => {
    const restored = deserializePortfolioPositions(JSON.stringify([{ ...position, corporateActionsAppliedUntil: '2026-10-25T23:00:00-08:00' }]))[0]
    expect(restored.corporateActionsAppliedUntil).toBe('2026-10-25')
  })

  it('导出时拒绝无效游标，防止生成已调整数值却缺少游标的备份', () => {
    const invalid = { ...position, corporateActionsAppliedUntil: 'invalid' }
    expect(() => serializePortfolioPositions([invalid])).toThrow('除权除息游标日期无效')
  })

  it('往返保留真实成本、成交价、买入日、风险及完整资产身份', () => {
    const restored = deserializePortfolioPositions(serializePortfolioPositions([position]))
    expect(restored).toEqual([{
      assetKey: 'ETF:A_SHARE:510880', assetType: 'ETF', market: 'A_SHARE', code: '510880',
      symbol: undefined, name: '红利ETF', direction: 'BUY', shares: 1000, avgCost: 2.505,
      tradePrice: 2.5, openedAt: '2026-10-20', riskLevel: 'LOW'
    }])
  })

  it('导入后编辑日期保留历史成本，即使当前最低佣金已变更', () => {
    const restored = deserializePortfolioPositions(serializePortfolioPositions([position]))[0]
    const cost = calculatePortfolioEditorCost({
      mode: 'edit', initialValues: { shares: restored.shares, avgCost: restored.tradePrice ?? restored.avgCost, originalAvgCost: restored.avgCost, tradePrice: restored.tradePrice },
      shares: restored.shares, price: restored.tradePrice ?? restored.avgCost, commissionRate: 0.001, minCommission: 100
    })
    expect(cost.trueCost).toBe(2.505)
    expect(cost.tradePrice).toBe(2.5)
  })

  it('兼容仅有symbol与成本价的旧JSON，不伪造未知成交价', () => {
    const restored = deserializePortfolioPositions('[{"symbol":"601398","name":"工商银行","shares":100,"avgCost":10.05}]')[0]
    expect(restored).toMatchObject({ assetKey: 'STOCK:A_SHARE:601398', assetType: 'STOCK', market: 'A_SHARE', code: '601398', avgCost: 10.05 })
    expect(restored.tradePrice).toBeUndefined()
  })
})
