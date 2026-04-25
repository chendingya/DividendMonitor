export type ValuationWindowKey = '10Y' | '20Y'

export type ValuationTrendPoint = {
  date: string
  value: number
}

export type ValuationMetric = {
  currentValue?: number
  currentPercentile?: number
  status?: string
  history: ValuationTrendPoint[]
}

export type ValuationWindowSnapshot = {
  window: ValuationWindowKey
  percentile?: number
  p30?: number
  p50?: number
  p70?: number
  sampleSize: number
}

function resolveValuationStatus(percentile?: number) {
  if (percentile == null) {
    return undefined
  }
  if (percentile <= 30) {
    return '估值较低'
  }
  if (percentile >= 70) {
    return '估值较高'
  }
  return '估值中等'
}

function quantile(sortedValues: number[], percentile: number) {
  if (sortedValues.length === 0) {
    return undefined
  }

  if (sortedValues.length === 1) {
    return sortedValues[0]
  }

  const index = (sortedValues.length - 1) * percentile
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex]
  }

  const lower = sortedValues[lowerIndex]
  const upper = sortedValues[upperIndex]
  const weight = index - lowerIndex
  return lower + (upper - lower) * weight
}

function subtractYears(date: string, years: number) {
  const anchor = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  anchor.setUTCFullYear(anchor.getUTCFullYear() - years)
  return anchor.toISOString().slice(0, 10)
}

function buildWindowSnapshot(
  history: ValuationTrendPoint[],
  years: number,
  window: ValuationWindowKey,
  currentValue?: number
): ValuationWindowSnapshot {
  const latestDate = history[0]?.date
  const lowerBound = latestDate ? subtractYears(latestDate, years) : null
  const values = history
    .filter((point) => (lowerBound ? point.date >= lowerBound : true))
    .map((point) => point.value)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)

  if (values.length === 0 || currentValue == null || currentValue <= 0) {
    return {
      window,
      sampleSize: values.length
    }
  }

  const belowOrEqualCount = values.filter((value) => value <= currentValue).length

  return {
    window,
    percentile: Number(((belowOrEqualCount / values.length) * 100).toFixed(2)),
    p30: quantile(values, 0.3),
    p50: quantile(values, 0.5),
    p70: quantile(values, 0.7),
    sampleSize: values.length
  }
}

export function buildValuationWindows(metric?: ValuationMetric) {
  const history = (metric?.history ?? [])
    .filter((point) => point.date && Number.isFinite(point.value) && point.value > 0)
    .sort((left, right) => right.date.localeCompare(left.date))

  const currentValue = metric?.currentValue ?? history[0]?.value
  const tenYearWindow = buildWindowSnapshot(history, 10, '10Y', currentValue)
  const twentyYearWindow = buildWindowSnapshot(history, 20, '20Y', currentValue)
  const status = metric?.status ?? resolveValuationStatus(metric?.currentPercentile ?? tenYearWindow.percentile)

  return {
    currentValue,
    currentPercentile: metric?.currentPercentile,
    status,
    windows: [tenYearWindow, twentyYearWindow]
  }
}
