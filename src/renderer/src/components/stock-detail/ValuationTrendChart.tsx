import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as echarts from 'echarts'
import type { AssetDetailDto, ValuationWindowKeyDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'
import {
  buildPercentileGuideLines,
  buildPercentileSeries,
  buildTrendAxisDates,
  buildValueSeriesByDates,
  filterTrendDatesByRange,
  toggleMetricVisibility,
  type ValuationMetricKey,
  type ValuationTrendRange
} from '@renderer/components/stock-detail/valuationTrendChartUtils'

type ValuationTrendChartProps = {
  detail: AssetDetailDto
  valuationWindow: ValuationWindowKeyDto
}

function createResizeObserver(target: HTMLDivElement, chart: echarts.ECharts) {
  const resizeObserver = new ResizeObserver(() => chart.resize())
  resizeObserver.observe(target)
  return resizeObserver
}

type MetricTrendPanelProps = {
  chartRef: { current: HTMLDivElement | null }
  title: string
  valueLabel: string
  percentileLabel: string
  valueColor: string
  percentileColor: string
  axisDates: string[]
  valueSeries: Array<number | null>
  percentileSeries: Array<number | null>
  valuationWindow: ValuationWindowKeyDto
}

function MetricTrendPanel({
  chartRef,
  title,
  valueLabel,
  percentileLabel,
  valueColor,
  percentileColor,
  axisDates,
  valueSeries,
  percentileSeries,
  valuationWindow
}: MetricTrendPanelProps) {
  useEffect(() => {
    if (!chartRef.current || axisDates.length === 0) {
      return
    }

    const chart = echarts.init(chartRef.current)
    chart.setOption({
      animation: false,
      grid: {
        left: 52,
        right: 54,
        top: 56,
        bottom: 56
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        top: 8,
        right: 8,
        textStyle: {
          color: '#66707a'
        }
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 18,
          bottom: 12
        }
      ],
      xAxis: {
        type: 'category',
        data: axisDates,
        axisLabel: {
          color: '#66707a',
          formatter: (value: string) => value.slice(0, 7)
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(171, 173, 175, 0.28)'
          }
        }
      },
      yAxis: [
        {
          type: 'value',
          name: valueLabel,
          nameTextStyle: {
            color: '#66707a'
          },
          axisLabel: {
            color: '#66707a'
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(171, 173, 175, 0.12)'
            }
          }
        },
        {
          type: 'value',
          min: 0,
          max: 100,
          name: percentileLabel,
          nameTextStyle: {
            color: '#66707a'
          },
          axisLabel: {
            color: '#66707a',
            formatter: '{value}%'
          },
          splitLine: {
            show: false
          }
        }
      ],
      series: [
        {
          name: valueLabel,
          type: 'line',
          data: valueSeries,
          showSymbol: false,
          smooth: true,
          connectNulls: false,
          lineStyle: {
            color: valueColor,
            width: 2.5
          }
        },
        {
          name: percentileLabel,
          type: 'line',
          yAxisIndex: 1,
          data: percentileSeries,
          showSymbol: false,
          smooth: true,
          connectNulls: false,
          lineStyle: {
            color: percentileColor,
            width: 2.5
          },
          markLine: {
            symbol: 'none',
            label: {
              color: '#8b949e'
            },
            lineStyle: {
              type: 'dashed',
              color: 'rgba(139, 148, 158, 0.55)'
            },
            data: buildPercentileGuideLines()
          }
        }
      ]
    })

    const resizeObserver = createResizeObserver(chartRef.current, chart)
    return () => {
      resizeObserver.disconnect()
      chart.dispose()
    }
  }, [axisDates, chartRef, percentileColor, percentileLabel, percentileSeries, title, valuationWindow, valueColor, valueLabel, valueSeries])

  return (
    <div>
      <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#1f2328' }}>{title}</div>
      <div ref={chartRef as RefObject<HTMLDivElement>} style={{ width: '100%', height: 320 }} />
    </div>
  )
}

export function ValuationTrendChart({ detail, valuationWindow }: ValuationTrendChartProps) {
  const peChartRef = useRef<HTMLDivElement | null>(null)
  const pbChartRef = useRef<HTMLDivElement | null>(null)
  const [metricVisibility, setMetricVisibility] = useState({ pe: true, pb: true })
  const [trendRange, setTrendRange] = useState<ValuationTrendRange>('10Y')

  const peHistory = detail.valuation?.pe?.history
  const pbHistory = detail.valuation?.pb?.history
  const axisDates = useMemo(() => buildTrendAxisDates(peHistory, pbHistory), [pbHistory, peHistory])
  const filteredAxisDates = useMemo(() => filterTrendDatesByRange(axisDates, trendRange), [axisDates, trendRange])
  const peValues = useMemo(() => buildValueSeriesByDates(filteredAxisDates, peHistory), [filteredAxisDates, peHistory])
  const pbValues = useMemo(() => buildValueSeriesByDates(filteredAxisDates, pbHistory), [filteredAxisDates, pbHistory])
  const pePercentile = useMemo(() => buildPercentileSeries(peHistory, valuationWindow), [peHistory, valuationWindow])
  const pbPercentile = useMemo(() => buildPercentileSeries(pbHistory, valuationWindow), [pbHistory, valuationWindow])
  const pePercentileValues = useMemo(
    () => buildValueSeriesByDates(filteredAxisDates, pePercentile),
    [filteredAxisDates, pePercentile]
  )
  const pbPercentileValues = useMemo(
    () => buildValueSeriesByDates(filteredAxisDates, pbPercentile),
    [filteredAxisDates, pbPercentile]
  )

  function toggleMetric(metric: ValuationMetricKey) {
    setMetricVisibility((current) => toggleMetricVisibility(current, metric))
  }

  if (filteredAxisDates.length === 0) {
    return null
  }

  return (
    <AppCard title="估值趋势">
      <div className="ledger-segmented-control" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`ledger-filter-chip ${metricVisibility.pe ? 'is-active' : ''}`}
          onClick={() => toggleMetric('pe')}
        >
          PE 图
        </button>
        <button
          type="button"
          className={`ledger-filter-chip ${metricVisibility.pb ? 'is-active' : ''}`}
          onClick={() => toggleMetric('pb')}
        >
          PB 图
        </button>
        <button
          type="button"
          className={`ledger-filter-chip ${trendRange === '5Y' ? 'is-active' : ''}`}
          onClick={() => setTrendRange('5Y')}
        >
          近5年
        </button>
        <button
          type="button"
          className={`ledger-filter-chip ${trendRange === '10Y' ? 'is-active' : ''}`}
          onClick={() => setTrendRange('10Y')}
        >
          近10年
        </button>
        <button
          type="button"
          className={`ledger-filter-chip ${trendRange === 'ALL' ? 'is-active' : ''}`}
          onClick={() => setTrendRange('ALL')}
        >
          全部
        </button>
      </div>
      <div style={{ marginBottom: 8, color: '#8b949e', fontSize: 12 }}>
        每张图都把“估值倍数”和“对应分位”放在一起，左轴看倍数，右轴看 {valuationWindow} 分位。
      </div>
      <div style={{ marginBottom: 12, color: '#8b949e', fontSize: 12 }}>
        分位曲线按当前选择的 {valuationWindow === '10Y' ? '近 10 年' : '近 20 年'} 历史窗口滚动计算，并带 30/50/70 分位参考线。
      </div>
      {metricVisibility.pe ? (
        <MetricTrendPanel
          chartRef={peChartRef}
          title="PE(TTM) 与 PE 分位"
          valueLabel="PE(TTM)"
          percentileLabel={`PE ${valuationWindow}分位`}
          valueColor="#0052d0"
          percentileColor="#00a870"
          axisDates={filteredAxisDates}
          valueSeries={peValues}
          percentileSeries={pePercentileValues}
          valuationWindow={valuationWindow}
        />
      ) : null}
      {metricVisibility.pb ? (
        <div style={{ marginTop: metricVisibility.pe ? 18 : 0 }}>
          <MetricTrendPanel
            chartRef={pbChartRef}
            title="PB(MRQ) 与 PB 分位"
            valueLabel="PB(MRQ)"
            percentileLabel={`PB ${valuationWindow}分位`}
            valueColor="#7a5af8"
            percentileColor="#f79009"
            axisDates={filteredAxisDates}
            valueSeries={pbValues}
            percentileSeries={pbPercentileValues}
            valuationWindow={valuationWindow}
          />
        </div>
      ) : null}
    </AppCard>
  )
}
