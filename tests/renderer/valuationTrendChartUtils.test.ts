import { describe, expect, it } from 'vitest'
import {
  buildPercentileGuideLines,
  buildPercentileSeries,
  buildTrendAxisDates,
  buildValueSeriesByDates,
  filterTrendDatesByRange,
  toggleMetricVisibility
} from '@renderer/components/stock-detail/valuationTrendChartUtils'

describe('valuationTrendChartUtils', () => {
  it('builds a merged axis from pe and pb histories', () => {
    expect(
      buildTrendAxisDates(
        [
          { date: '2024-01-01', value: 10 },
          { date: '2024-03-01', value: 12 }
        ],
        [
          { date: '2024-02-01', value: 1.2 },
          { date: '2024-03-01', value: 1.3 }
        ]
      )
    ).toEqual(['2024-01-01', '2024-02-01', '2024-03-01'])
  })

  it('maps history values onto the merged axis and leaves gaps as null', () => {
    expect(
      buildValueSeriesByDates(['2024-01-01', '2024-02-01', '2024-03-01'], [
        { date: '2024-01-01', value: 10 },
        { date: '2024-03-01', value: 12 }
      ])
    ).toEqual([10, null, 12])
  })

  it('computes rolling percentiles based on the selected window', () => {
    const history = [
      { date: '2010-01-01', value: 30 },
      { date: '2018-01-01', value: 10 },
      { date: '2024-01-01', value: 20 }
    ]

    expect(buildPercentileSeries(history, '10Y')).toEqual([
      { date: '2010-01-01', value: Number.NaN },
      { date: '2018-01-01', value: 50 },
      { date: '2024-01-01', value: 100 }
    ])

    expect(buildPercentileSeries(history, '20Y')).toEqual([
      { date: '2010-01-01', value: 100 },
      { date: '2018-01-01', value: 33.33 },
      { date: '2024-01-01', value: 66.67 }
    ])
  })

  it('filters dates by selected trend range', () => {
    const dates = ['2018-01-01', '2020-01-01', '2022-01-01', '2024-01-01']

    expect(filterTrendDatesByRange(dates, 'ALL')).toEqual(dates)
    expect(filterTrendDatesByRange(dates, '5Y')).toEqual(['2020-01-01', '2022-01-01', '2024-01-01'])
    expect(filterTrendDatesByRange(dates, '10Y')).toEqual(dates)
  })

  it('keeps at least one metric visible when toggling display', () => {
    expect(toggleMetricVisibility({ pe: true, pb: true }, 'pe')).toEqual({ pe: false, pb: true })
    expect(toggleMetricVisibility({ pe: true, pb: false }, 'pe')).toEqual({ pe: true, pb: false })
  })

  it('builds percentile guide lines for 30 50 70 bands', () => {
    expect(buildPercentileGuideLines()).toEqual([
      { name: '30分位', yAxis: 30 },
      { name: '50分位', yAxis: 50 },
      { name: '70分位', yAxis: 70 }
    ])
  })
})
