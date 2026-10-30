import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortfolioPosition } from '@renderer/services/portfolioStore'

const snapshot = vi.hoisted(() => ({ positions: [] as PortfolioPosition[] }))
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return {
    ...react,
    useState: (initial: unknown) => {
      const [value, setValue] = react.useState(initial)
      return [Array.isArray(initial) ? snapshot.positions : value, setValue]
    }
  }
})
vi.mock('@renderer/services/portfolioStore', () => ({ listPortfolioPositionsFromBackend: async () => [] }))
vi.mock('@renderer/services/assetApi', () => ({ assetApi: { getDetail: async () => undefined } }))

import { calculatePortfolioEditorCost } from '@renderer/components/dashboard/portfolioTransactionEditor'
import { usePortfolio } from '@renderer/hooks/usePortfolio'

const identity = { assetKey: 'ETF:A_SHARE:510880', assetType: 'ETF' as const, market: 'A_SHARE' as const, code: '510880', name: '红利ETF' }
function cost(direction: 'BUY' | 'SELL') {
  return calculatePortfolioEditorCost({
    mode: 'create', direction, initialValues: { shares: 100, avgCost: 3.2 },
    shares: 100, price: 3.2, commissionRate: 0.0001, minCommission: 5
  })
}

beforeEach(() => { snapshot.positions = [] })

describe('持仓买卖费用与净成本', () => {
  it('买入100份每份3.2元，5元佣金计入325元总支出', () => {
    expect(cost('BUY').trueCost * 100).toBe(325)
  })

  it('卖出100份每份3.2元，扣除5元佣金后净回款315元', () => {
    expect(cost('SELL').trueCost * 100).toBe(315)
  })

  it('真实持仓聚合两笔325元买入及一笔315元卖出，剩余100份净成本335元', () => {
    snapshot.positions = [
      { ...identity, id: 'buy-1', direction: 'BUY', shares: 100, avgCost: cost('BUY').trueCost, updatedAt: '2026-10-01' },
      { ...identity, id: 'buy-2', direction: 'BUY', shares: 100, avgCost: cost('BUY').trueCost, updatedAt: '2026-10-02' },
      { ...identity, id: 'sell-1', direction: 'SELL', shares: 100, avgCost: cost('SELL').trueCost, updatedAt: '2026-10-03' }
    ]
    let result!: ReturnType<typeof usePortfolio>
    function Probe() { result = usePortfolio(); return null }
    renderToStaticMarkup(createElement(Probe))
    expect(result.rows[0]).toMatchObject({ netShares: 100, netCostAmount: 335, avgCost: 3.35, transactionCount: 3 })
    expect(result.totalCost).toBe(335)
  })

  it('编辑卖出记录未改变价格数量时保留原净回款，不重复扣佣金', () => {
    const result = calculatePortfolioEditorCost({
      mode: 'edit', direction: 'SELL', initialValues: { direction: 'SELL', shares: 100, avgCost: 3.2, tradePrice: 3.2, originalAvgCost: 3.15 },
      shares: 100, price: 3.2, commissionRate: 0.0001, minCommission: 8
    })
    expect(result.trueCost * 100).toBe(315)
  })
})
