import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { HistoricalPricePointDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

type AdjustmentType = 'NONE' | 'QFTA' | 'HFTA'

const LABELS: Record<AdjustmentType, string> = {
  NONE: '不复权',
  QFTA: '前复权',
  HFTA: '后复权'
}

export function PriceTrendChart({ data }: { data?: HistoricalPricePointDto[] }) {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const [adjustment, setAdjustment] = useState<AdjustmentType>('QFTA')

  const points = useMemo(() => data ?? [], [data])
  const axisDates = useMemo(() => points.map((point) => point.date), [points])
  const values = useMemo(() => {
    if (adjustment === 'QFTA') return points.map((point) => point.qfqClose ?? point.close)
    if (adjustment === 'HFTA') return points.map((point) => point.hfqClose ?? point.close)
    return points.map((point) => point.close)
  }, [points, adjustment])

  useEffect(() => {
    if (!chartRef.current || axisDates.length === 0) {
      return
    }

    const chart = echarts.init(chartRef.current)
    chart.setOption({
      animation: false,
      grid: { left: 56, right: 16, top: 16, bottom: 56 },
      tooltip: { trigger: 'axis' },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0 },
        { type: 'slider', xAxisIndex: 0, height: 18, bottom: 12 }
      ],
      xAxis: {
        type: 'category',
        data: axisDates,
        axisLabel: { color: '#66707a', formatter: (value: string) => value.slice(0, 7) },
        axisLine: { lineStyle: { color: 'rgba(171, 173, 175, 0.28)' } }
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: '#66707a' },
        splitLine: { lineStyle: { color: 'rgba(171, 173, 175, 0.12)' } }
      },
      series: [
        {
          name: LABELS[adjustment],
          type: 'line',
          data: values,
          showSymbol: false,
          smooth: true,
          connectNulls: false,
          lineStyle: { color: '#0052d0', width: 2.5 }
        }
      ]
    })

    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(chartRef.current)
    return () => {
      resizeObserver.disconnect()
      chart.dispose()
    }
  }, [axisDates, values, adjustment])

  if (points.length === 0) {
    return (
      <AppCard title="价格走势">
        <div style={{ color: '#8b949e', fontSize: 13 }}>暂无价格数据</div>
      </AppCard>
    )
  }

  return (
    <AppCard title="价格走势">
      <div className="ledger-segmented-control" style={{ marginBottom: 12 }}>
        {(Object.keys(LABELS) as AdjustmentType[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`ledger-filter-chip ${adjustment === key ? 'is-active' : ''}`}
            onClick={() => setAdjustment(key)}
          >
            {LABELS[key]}
          </button>
        ))}
      </div>
      <div ref={chartRef} style={{ width: '100%', height: 320 }} />
    </AppCard>
  )
}
