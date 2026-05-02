import type { ValuationTrendPointDto, ValuationWindowKeyDto } from '@shared/contracts/api'

type TrendSeriesPoint = {
  date: string
  value: number
}

export type ValuationMetricKey = 'pe' | 'pb'

export type ValuationMetricVisibility = Record<ValuationMetricKey, boolean>

export type ValuationTrendRange = '5Y' | '10Y' | 'ALL'

function sortHistoryAscending(history?: ValuationTrendPointDto[]) {
  return [...(history ?? [])].sort((left, right) => left.date.localeCompare(right.date))
}

function subtractYears(date: string, years: number) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date
  }
  const anchor = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(anchor.getTime())) {
    return date
  }
  anchor.setUTCFullYear(anchor.getUTCFullYear() - years)
  return anchor.toISOString().slice(0, 10)
}

export function buildTrendAxisDates(peHistory?: ValuationTrendPointDto[], pbHistory?: ValuationTrendPointDto[]) {
  const merged = new Set<string>()
  for (const item of sortHistoryAscending(peHistory)) {
    merged.add(item.date)
  }
  for (const item of sortHistoryAscending(pbHistory)) {
    merged.add(item.date)
  }
  return [...merged].sort((left, right) => left.localeCompare(right))
}

export function buildValueSeriesByDates(dates: string[], history?: ValuationTrendPointDto[]) {
  const seriesMap = new Map((history ?? []).map((item) => [item.date, item.value]))
  return dates.map((date) => {
    const value = seriesMap.get(date)
    return value != null && Number.isFinite(value) ? value : null
  })
}

export function buildPercentileSeries(history: ValuationTrendPointDto[] | undefined, window: ValuationWindowKeyDto) {
  const years = window === '10Y' ? 10 : 20
  const points = sortHistoryAscending(history)
  const latestDate = points[points.length - 1]?.date
  const lowerBound = latestDate ? subtractYears(latestDate, years) : undefined
  const referenceValues = points
    .filter((item) => (lowerBound ? item.date >= lowerBound : true))
    .map((item) => item.value)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)

  return points.map<TrendSeriesPoint>((point) => {
    if ((lowerBound && point.date < lowerBound) || referenceValues.length === 0) {
      return {
        date: point.date,
        value: Number.NaN
      }
    }

    const belowOrEqualCount = referenceValues.filter((value) => value <= point.value).length
    return {
      date: point.date,
      value: Number(((belowOrEqualCount / referenceValues.length) * 100).toFixed(2))
    }
  })
}

export function toggleMetricVisibility(
  current: ValuationMetricVisibility,
  metric: ValuationMetricKey
): ValuationMetricVisibility {
  const enabledCount = Object.values(current).filter(Boolean).length
  if (current[metric] && enabledCount === 1) {
    return current
  }

  return {
    ...current,
    [metric]: !current[metric]
  }
}

export function buildPercentileGuideLines() {
  return [
    { name: '30分位', yAxis: 30 },
    { name: '50分位', yAxis: 50 },
    { name: '70分位', yAxis: 70 }
  ]
}

export function filterTrendDatesByRange(dates: string[], range: ValuationTrendRange) {
  if (range === 'ALL' || dates.length === 0) {
    return dates
  }

  const latestDate = dates[dates.length - 1]
  // Guard against invalid date strings
  if (!latestDate || !/^\d{4}-\d{2}-\d{2}$/.test(latestDate)) {
    return dates
  }

  const anchor = new Date(`${latestDate}T00:00:00Z`)
  if (Number.isNaN(anchor.getTime())) {
    return dates
  }

  anchor.setUTCFullYear(anchor.getUTCFullYear() - (range === '5Y' ? 5 : 10))
  const lowerBound = anchor.toISOString().slice(0, 10)
  return dates.filter((date) => date >= lowerBound)
}
