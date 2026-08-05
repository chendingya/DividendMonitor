import type { HousingIndexSeriesPointDto } from '@shared/contracts/api'

export type IndexChangePoint = {
  reportDate: string
  newHomeChangePercent: number
  secondHandChangePercent: number
}

export type IndexChangeResult = {
  points: IndexChangePoint[]
  baseDate: string | null
  newHomeChange: number | null
  secondHandChange: number | null
}

/**
 * 将绝对指数序列（基准 100）转换为相对基准月的累计涨跌幅序列（%）。
 * - 基准参数支持 'YYYY-MM'（精确月）或 'YYYY'（该年第一个数据点）。
 * - 基准早于序列起点时回退到起点；序列中间缺年时锚定下一个可用点；
 *   基准晚于最新数据点时返回空结果（UI 层应禁用此类选项）。
 */
export function computeIndexChangePercent(
  series: HousingIndexSeriesPointDto[],
  baseYearOrDate: string
): IndexChangeResult {
  if (series.length === 0) {
    return { points: [], baseDate: null, newHomeChange: null, secondHandChange: null }
  }

  if (baseYearOrDate === '起点') {
    return computeIndexChangePercent(series, series[0].reportDate)
  }

  const target = baseYearOrDate.length === 4 ? `${baseYearOrDate}-01` : baseYearOrDate

  let baseIndex = series.findIndex((point) => point.reportDate === target)
  if (baseIndex === -1) {
    baseIndex = series.findIndex((point) => point.reportDate.startsWith(target.slice(0, 4)))
  }
  if (baseIndex === -1) {
    const last = series[series.length - 1].reportDate
    if (last < target) {
      return { points: [], baseDate: null, newHomeChange: null, secondHandChange: null }
    }
    baseIndex = series[0].reportDate >= target ? 0 : series.findIndex((point) => point.reportDate >= target)
  }

  const base = series[baseIndex]
  const newHomeBase = base.newHomeIndex
  const secondHandBase = base.secondHandIndex

  const round1 = (value: number): number => Math.round(value * 10) / 10
  const points: IndexChangePoint[] = series.map((point) => ({
    reportDate: point.reportDate,
    newHomeChangePercent: round1((point.newHomeIndex / newHomeBase - 1) * 100),
    secondHandChangePercent: round1((point.secondHandIndex / secondHandBase - 1) * 100)
  }))

  const latest = points[points.length - 1]
  return {
    points,
    baseDate: base.reportDate,
    newHomeChange: latest.newHomeChangePercent,
    secondHandChange: latest.secondHandChangePercent
  }
}

/** 金额格式化：≥ 1 万显示 x.x 万（整数显示为 x 万），否则千分位原值 */
export function formatTotalYuan(value: number | null | undefined): string {
  if (value == null) return '--'
  if (value >= 10_000) {
    const wan = value / 10_000
    const rounded = Math.round(wan * 10) / 10
    return Number.isInteger(rounded) ? `${rounded} 万` : `${rounded.toFixed(1)} 万`
  }
  return value.toLocaleString()
}
