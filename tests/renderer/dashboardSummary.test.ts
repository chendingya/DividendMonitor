import { describe, expect, it } from 'vitest'
import {
  buildAssetTypeDistribution,
  buildRecentTransactions,
  buildSummaryCells,
  type RecentTxDividendInput,
  type RecentTxRowInput
} from '@renderer/pages/dashboardSummary'

describe('buildAssetTypeDistribution', () => {
  it('按资产类型聚合市值并降序排列', () => {
    const slices = buildAssetTypeDistribution([
      { assetType: 'STOCK', marketValue: 100 },
      { assetType: 'STOCK', marketValue: 50 },
      { assetType: 'ETF', marketValue: 300 },
      { assetType: 'GOLD', marketValue: 80 },
      { assetType: 'SILVER', marketValue: 20 }
    ])
    expect(slices.map((s) => [s.name, s.value])).toEqual([
      ['ETF', 300],
      ['股票', 150],
      ['贵金属', 100]
    ])
    expect(slices.every((s) => Boolean(s.color))).toBe(true)
  })

  it('忽略无市值或非正市值的行，缺失类型归入其他', () => {
    const slices = buildAssetTypeDistribution([
      { assetType: 'FUND', marketValue: 40 },
      { assetType: 'STOCK', marketValue: 0 },
      { assetType: 'STOCK', marketValue: undefined },
      { marketValue: 10 }
    ])
    expect(slices.map((s) => [s.name, s.value])).toEqual([
      ['基金', 40],
      ['其他', 10]
    ])
  })

  it('空持仓返回空数组', () => {
    expect(buildAssetTypeDistribution([])).toEqual([])
  })
})

function tradeRow(overrides: Partial<RecentTxRowInput> = {}): RecentTxRowInput {
  return {
    id: 'row-1',
    name: '长江电力',
    code: '600900',
    symbol: '600900',
    transactions: [
      {
        id: 'tx-1',
        direction: 'BUY',
        shares: 200,
        avgCost: 28.4,
        openedAt: '2026-11-05',
        updatedAt: '2026-11-05T10:00:00.000Z'
      }
    ],
    ...overrides
  }
}

describe('buildRecentTransactions', () => {
  it('合并买卖交易与分红记录，按日期降序取前 N 条', () => {
    const rows: RecentTxRowInput[] = [
      tradeRow(),
      tradeRow({
        id: 'row-2',
        name: '沪深300ETF',
        code: '510300',
        symbol: undefined,
        transactions: [
          {
            id: 'tx-2',
            direction: 'SELL',
            shares: 500,
            avgCost: 3.9,
            tradePrice: 4.1,
            openedAt: '2026-10-22',
            updatedAt: '2026-10-22T10:00:00.000Z'
          }
        ]
      })
    ]
    const dividends: RecentTxDividendInput[] = [
      { assetKey: 'ETF:A_SHARE:510880', assetName: '红利ETF', code: '510880', exDate: '2026-10-30', estimatedDividendAmount: 1236 },
      { assetKey: 'STOCK:A_SHARE:600036', assetName: '招商银行', code: '600036', exDate: '2026-09-15', estimatedDividendAmount: 800 },
      { assetKey: 'STOCK:A_SHARE:601398', assetName: '工商银行', code: '601398', exDate: '2026-08-01', estimatedDividendAmount: 600 }
    ]
    const items = buildRecentTransactions(rows, dividends, 4)
    expect(items.map((i) => [i.date, i.kind, i.assetName])).toEqual([
      ['2026-11-05', 'BUY', '长江电力'],
      ['2026-10-30', 'DIVIDEND', '红利ETF'],
      ['2026-10-22', 'SELL', '沪深300ETF'],
      ['2026-09-15', 'DIVIDEND', '招商银行']
    ])
  })

  it('买入金额优先用成交价，缺失时回落成本价', () => {
    const [withTrade] = buildRecentTransactions(
      [tradeRow({ transactions: [{ ...tradeRow().transactions[0], tradePrice: 30 }] })],
      [],
      5
    )
    expect(withTrade.amount).toBeCloseTo(6000)
    const [withoutTrade] = buildRecentTransactions([tradeRow()], [], 5)
    expect(withoutTrade.amount).toBeCloseTo(5680)
    expect(withoutTrade.detail).toContain('200')
    expect(withoutTrade.detail).toContain('28.4')
  })

  it('无买入日期的交易回落 updatedAt 日期部分', () => {
    const [item] = buildRecentTransactions(
      [tradeRow({ transactions: [{ ...tradeRow().transactions[0], openedAt: undefined }] })],
      [],
      5
    )
    expect(item.date).toBe('2026-11-05')
  })

  it('空数据返回空数组', () => {
    expect(buildRecentTransactions([], [], 5)).toEqual([])
  })
})

describe('buildSummaryCells', () => {
  const base = {
    totalValue: 243180.2,
    totalCost: 216340,
    totalReturn: 0.124,
    avgYieldMetric: 0.0486 as number | undefined,
    rowCount: 5,
    forecast: { year: 2026, annualEstimatedTotal: 11820, yearToDateActual: 9340 }
  }

  it('生成四格：总市值/投入成本/年度分红/加权收益指标', () => {
    const cells = buildSummaryCells(base)
    expect(cells.map((c) => c.label)).toEqual(['持仓总市值', '投入成本', '年度分红（预估）', '加权收益指标'])
    expect(cells[0].value).toContain('243,180')
    expect(cells[0].hint).toContain('12.40%')
    expect(cells[1].value).toContain('216,340')
    expect(cells[1].hint).toContain('5')
    expect(cells[2].value).toContain('11,820')
    expect(cells[2].hint).toContain('9,340')
    expect(cells[3].value).toBe('4.86%')
  })

  it('分红预测缺失时显示占位符', () => {
    const cells = buildSummaryCells({ ...base, forecast: null })
    expect(cells[2].value).toBe('--')
  })

  it('空持仓时金额与指标均为占位符', () => {
    const cells = buildSummaryCells({ ...base, rowCount: 0, totalValue: 0, totalCost: 0, avgYieldMetric: undefined, forecast: null })
    expect(cells[0].value).toBe('--')
    expect(cells[1].value).toBe('--')
    expect(cells[3].value).toBe('--')
  })
})