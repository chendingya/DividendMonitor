import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export type DistributionSlice = {
  name: string
  value: number
  color?: string
}

export function PortfolioDistributionPie({ items, height = 300 }: { items: DistributionSlice[]; height?: number }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) {
      return
    }
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current)
    }
    const customColors = items.map((i) => i.color).filter((c): c is string => Boolean(c))
    const palette = customColors.length > 0 ? customColors : undefined
    instanceRef.current.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      legend: { bottom: 0, type: 'scroll' },
      ...(palette ? { color: palette } : {}),
      series: [{
        type: 'pie',
        radius: ['35%', '65%'],
        avoidLabelOverlap: true,
        label: { formatter: '{b}\n{d}%' },
        data: items.map((i) => ({ name: i.name, value: Math.round(i.value) }))
      }]
    }, { notMerge: true })
    return () => {
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
  }, [items, height])

  return <div ref={chartRef} style={{ width: '100%', height }} />
}