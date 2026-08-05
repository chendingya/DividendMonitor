import { describe, expect, it } from 'vitest'
import { buildIndustryYieldMap, buildYieldMap } from '@main/domain/services/yieldMapService'

const TODAY = new Date('2026-08-03T00:00:00.000Z')

describe('buildYieldMap', () => {
  it('按 TTM 口径聚合：近12个月∑每股派息 ÷ 最新价', () => {
    const quotes = [{ code: '600519', market: '1', name: '贵州茅台', price: 1450, industry: '白酒' }]
    const events = [
      { code: '600519', exDate: '2026-06-20', pretaxBonusRmb: 300 },  // 每股 30 元
      { code: '600519', exDate: '2025-06-20', pretaxBonusRmb: 300 }   // 超 12 个月，不计
    ]
    const result = buildYieldMap(quotes, events, TODAY)
    expect(result).toHaveLength(1)
    expect(result[0].yieldTtm).toBeCloseTo(30 / 1450, 6)
    expect(result[0].totalDps12m).toBeCloseTo(30, 6)
    expect(result[0].assetKey).toBe('STOCK:A_SHARE:600519')
    expect(result[0].industry).toBe('白酒')
  })

  it('无分红事件 → yieldTtm = 0', () => {
    const quotes = [{ code: '000001', market: '0', name: '平安银行', price: 10, industry: '银行' }]
    const result = buildYieldMap(quotes, [], TODAY)
    expect(result[0].yieldTtm).toBe(0)
    expect(result[0].totalDps12m).toBeUndefined()
  })

  it('价格缺失或非正 → yieldTtm = 0', () => {
    const quotes = [
      { code: '000001', market: '0', name: '停牌股', industry: '银行' },
      { code: '000002', market: '0', name: '零价股', price: 0, industry: '地产' }
    ]
    const events = [{ code: '000001', exDate: '2026-05-01', pretaxBonusRmb: 10 }]
    const result = buildYieldMap(quotes, events, TODAY)
    expect(result[0].yieldTtm).toBe(0)
    expect(result[1].yieldTtm).toBe(0)
  })

  it('无行业 → 归入「未分类」', () => {
    const quotes = [{ code: '000001', market: '0', name: '无名股', price: 10 }]
    const result = buildYieldMap(quotes, [], TODAY)
    expect(result[0].industry).toBe('未分类')
  })

  it('同股票一年两次分红自动累加', () => {
    const quotes = [{ code: '601398', market: '1', name: '工商银行', price: 5, industry: '银行' }]
    const events = [
      { code: '601398', exDate: '2026-07-10', pretaxBonusRmb: 1.4 },
      { code: '601398', exDate: '2026-01-15', pretaxBonusRmb: 1.6 }
    ]
    const result = buildYieldMap(quotes, events, TODAY)
    expect(result[0].yieldTtm).toBeCloseTo(0.3 / 5, 6)
  })

  it('exDate 缺失的事件不参与 TTM 累加', () => {
    const quotes = [{ code: '600000', market: '1', name: '浦发银行', price: 8, industry: '银行' }]
    const events = [{ code: '600000', pretaxBonusRmb: 4 }]
    const result = buildYieldMap(quotes, events, TODAY)
    expect(result[0].yieldTtm).toBe(0)
  })
})

describe('buildIndustryYieldMap', () => {
  it('按行业分组，中位数/均值/样本数正确且降序', () => {
    const stocks = [
      { assetKey: 'a', symbol: 'a', name: 'a', industry: '银行', price: 1, yieldTtm: 0.05 },
      { assetKey: 'b', symbol: 'b', name: 'b', industry: '银行', price: 1, yieldTtm: 0.07 },
      { assetKey: 'c', symbol: 'c', name: 'c', industry: '白酒', price: 1, yieldTtm: 0.03 },
      { assetKey: 'd', symbol: 'd', name: 'd', industry: '银行', price: 1, yieldTtm: 0.09 },
      { assetKey: 'e', symbol: 'e', name: 'e', industry: '银行', price: 1, yieldTtm: 0.11 }
    ]
    const result = buildIndustryYieldMap(stocks as never)
    expect(result).toHaveLength(2)
    expect(result[0].industry).toBe('银行')
    expect(result[0].medianYield).toBeCloseTo(0.08, 6)
    expect(result[0].avgYield).toBeCloseTo(0.08, 6)
    expect(result[0].stockCount).toBe(4)
    expect(result[1].industry).toBe('白酒')
  })

  it('yieldTtm=0 的股票不进入行业聚合', () => {
    const stocks = [
      { assetKey: 'a', symbol: 'a', name: 'a', industry: '银行', price: 1, yieldTtm: 0 },
      { assetKey: 'b', symbol: 'b', name: 'b', industry: '银行', price: 1, yieldTtm: 0.06 }
    ]
    const result = buildIndustryYieldMap(stocks as never)
    expect(result).toHaveLength(1)
    expect(result[0].stockCount).toBe(1)
    expect(result[0].medianYield).toBeCloseTo(0.06, 6)
  })

  it('空输入返回空数组', () => {
    expect(buildIndustryYieldMap([])).toEqual([])
  })
})
