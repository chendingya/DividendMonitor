import { describe, expect, it } from 'vitest'
import { computeIndexChangePercent, formatTotalYuan } from '@renderer/utils/housingCalc'

const series = [
  { reportDate: '2015-01', newHomeIndex: 100, secondHandIndex: 100 },
  { reportDate: '2015-06', newHomeIndex: 110, secondHandIndex: 105 },
  { reportDate: '2016-01', newHomeIndex: 120, secondHandIndex: 108 },
  { reportDate: '2018-01', newHomeIndex: 150, secondHandIndex: 130 },
  { reportDate: '2021-01', newHomeIndex: 180, secondHandIndex: 160 },
  { reportDate: '2026-06', newHomeIndex: 191.78, secondHandIndex: 189.3 }
]

describe('computeIndexChangePercent', () => {
  it('基准为首点（起点）时首点为 0%', () => {
    const result = computeIndexChangePercent(series, '2015-01')
    expect(result.baseDate).toBe('2015-01')
    expect(result.points[0].newHomeChangePercent).toBe(0)
    expect(result.points[0].secondHandChangePercent).toBe(0)
  })

  it('中间基准下前后符号正确，最新点等于相对基准累计涨跌', () => {
    const result = computeIndexChangePercent(series, '2015-01')
    expect(result.points[result.points.length - 1].newHomeChangePercent).toBeCloseTo(91.78, 1)
    expect(result.points[result.points.length - 1].secondHandChangePercent).toBeCloseTo(89.3, 1)
    expect(result.newHomeChange).toBeCloseTo(91.78, 1)
    expect(result.secondHandChange).toBeCloseTo(89.3, 1)
  })

  it('基准取该年第一个数据点', () => {
    const result = computeIndexChangePercent(series, '2021')
    expect(result.baseDate).toBe('2021-01')
    expect(result.newHomeChange).toBeCloseTo((191.78 / 180 - 1) * 100, 1)
  })

  it('基准早于序列起点时回退到起点', () => {
    const result = computeIndexChangePercent(series, '2010')
    expect(result.baseDate).toBe('2015-01')
    expect(result.points[0].newHomeChangePercent).toBe(0)
  })

  it('基准晚于最新数据点时禁用语义（无数据点可锚定）', () => {
    const result = computeIndexChangePercent(series, '2030')
    expect(result.points).toEqual([])
    expect(result.baseDate).toBeNull()
  })

  it('空序列返回空结果', () => {
    const result = computeIndexChangePercent([], '2021')
    expect(result.points).toEqual([])
    expect(result.baseDate).toBeNull()
  })

  it('基准为「起点」时锚定序列首个数据点', () => {
    const result = computeIndexChangePercent(series, '起点')
    expect(result.baseDate).toBe('2015-01')
    expect(result.points[0].newHomeChangePercent).toBe(0)
    expect(result.newHomeChange).toBeCloseTo(91.8, 1)
  })

  it('序列中某年无数据点时回退到最近可用年份', () => {
    const gapSeries = [
      { reportDate: '2015-01', newHomeIndex: 100, secondHandIndex: 100 },
      { reportDate: '2017-01', newHomeIndex: 120, secondHandIndex: 115 },
      { reportDate: '2018-01', newHomeIndex: 130, secondHandIndex: 120 }
    ]
    const result = computeIndexChangePercent(gapSeries, '2016')
    expect(result.baseDate).toBe('2017-01')
    expect(result.points[1].newHomeChangePercent).toBe(0)
  })
})

describe('formatTotalYuan', () => {
  it('万元展示为 x.x 万', () => {
    expect(formatTotalYuan(5_000_000)).toBe('500 万')
    expect(formatTotalYuan(5_020_000)).toBe('502 万')
  })

  it('千元级原样展示并加分隔符', () => {
    expect(formatTotalYuan(8_000)).toBe('8,000')
  })

  it('边界 10000 元为 1 万', () => {
    expect(formatTotalYuan(10_000)).toBe('1 万')
  })

  it('null/undefined 返回 --', () => {
    expect(formatTotalYuan(undefined)).toBe('--')
    expect(formatTotalYuan(null)).toBe('--')
  })

  it('月租金展示保留整数', () => {
    expect(formatTotalYuan(8_000)).toBe('8,000')
    expect(formatTotalYuan(123_456)).toBe('12.3 万')
  })
})
