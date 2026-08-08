import type { HousingIndexRecord } from '@main/domain/entities/Housing'

/** 租金收益率（%）= 月租金（元/㎡·月）× 12 / 房价（元/㎡）× 100 */
export function calculateRentalYield(rentPerSqm: number | undefined, pricePerSqm: number | undefined): number | null {
  if (!rentPerSqm || rentPerSqm <= 0 || !pricePerSqm || pricePerSqm <= 0) {
    return null
  }
  return (rentPerSqm * 12) / pricePerSqm * 100
}

/** 租售比（年）= 房价（元/㎡）/（月租金（元/㎡·月）× 12） */
export function calculatePriceToRentRatio(rentPerSqm: number | undefined, pricePerSqm: number | undefined): number | null {
  if (!rentPerSqm || rentPerSqm <= 0 || !pricePerSqm || pricePerSqm <= 0) {
    return null
  }
  return pricePerSqm / (rentPerSqm * 12)
}

export type RebuiltIndexPoint = {
  reportDate: string
  index: number
}

/**
 * 用环比指数连乘重建绝对指数序列。
 * 定基指数（2020 年=100）已停止发布，长期趋势需由 MoM（上月=100）链式重建。
 * 第一个有效月份锚定为 baseValue，其后各月 = 前月指数 × (MoM/100)。
 */
export function rebuildIndexSeries(
  records: Array<Pick<HousingIndexRecord, 'reportDate' | 'secondHandMoM'>>,
  baseValue = 100
): RebuiltIndexPoint[] {
  const points: RebuiltIndexPoint[] = []
  let running: number | null = null

  for (const record of records) {
    if (record.secondHandMoM == null || record.secondHandMoM <= 0) {
      continue
    }
    if (running == null) {
      running = baseValue
    } else {
      running = running * (record.secondHandMoM / 100)
    }
    points.push({ reportDate: record.reportDate, index: running })
  }

  return points
}

export type HousingDerivedMetrics = {
  rentalYieldPercent: number
  priceToRentRatio: number
}

/** 年化波动率计算所需的最少重建指数点数（少于 3 个月无法形成月收益序列） */
export const MIN_INDEX_SERIES_POINTS = 3

/**
 * 由环比连乘重建的房价指数序列计算年化波动率（%）。
 * 房价为月度数据：先算月收益率，样本标准差 × √12 得到年化口径，
 * 与股票日频波动率（×√252）在同一个「年化波动率」坐标系下可比。
 * 数据不足或指数序列无变化时返回 null。
 */
export function calculateIndexSeriesVolatility(
  series: RebuiltIndexPoint[],
  minPoints: number = MIN_INDEX_SERIES_POINTS
): number | null {
  const valid = series.filter((point) => point.index > 0)
  if (valid.length < minPoints) {
    return null
  }

  const returns: number[] = []
  for (let i = 1; i < valid.length; i++) {
    returns.push((valid[i].index - valid[i - 1].index) / valid[i - 1].index)
  }
  if (returns.length < 2) {
    return null
  }

  const mean = returns.reduce((sum, item) => sum + item, 0) / returns.length
  const variance =
    returns.reduce((sum, item) => sum + (item - mean) * (item - mean), 0) / (returns.length - 1)
  if (variance === 0) {
    return null
  }

  return Math.sqrt(variance) * Math.sqrt(12) * 100
}

/** 由租金与房价推导收益率与租售比；任一缺失时返回空对象 */
export function calculateHousingDerivedMetrics(input: {
  rentPerSqm?: number
  pricePerSqm?: number
}): Partial<HousingDerivedMetrics> {
  const rentalYieldPercent = calculateRentalYield(input.rentPerSqm, input.pricePerSqm)
  const priceToRentRatio = calculatePriceToRentRatio(input.rentPerSqm, input.pricePerSqm)

  if (rentalYieldPercent == null || priceToRentRatio == null) {
    return {}
  }
  return { rentalYieldPercent, priceToRentRatio }
}
