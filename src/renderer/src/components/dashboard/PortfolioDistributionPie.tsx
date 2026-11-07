import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export type DistributionSlice = {
  name: string
  value: number
  color?: string
}

export function buildDistributionPieOption(items: DistributionSlice[], hideAmounts: boolean) {
  const customColors = items.map((i) => i.color).filter((c): c is string => Boolean(c))
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; value: number; percent: number }) =>
        hideAmounts
          ? `${params.name}: ${params.percent}%`
          : `${params.name}: ¥${params.value} (${params.percent}%)`
    },
    legend: { bottom: 0, type: 'scroll' },
    ...(customColors.length > 0 ? { color: customColors } : {}),
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      avoidLabelOverlap: true,
      label: { formatter: '{b}\n{d}%' },
      data: items.map((i) => ({ name: i.name, value: Math.round(i.value) }))
    }]
  }
}

export function PortfolioDistributionPie({
  items,
  height = 300,
  hideAmounts = false
}: {
  items: DistributionSlice[]
  height?: number
  hideAmounts?: boolean
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) {
      return
    }
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current)
    }
    instanceRef.current.setOption(buildDistributionPieOption(items, hideAmounts), { notMerge: true })
    return () => {
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
  }, [items, height, hideAmounts])

  return <div ref={chartRef} style={{ width: '100%', height }} />
}
