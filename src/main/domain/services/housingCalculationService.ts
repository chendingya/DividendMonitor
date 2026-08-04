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
