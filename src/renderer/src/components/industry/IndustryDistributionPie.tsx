import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { IndustryDistributionItemDto } from '@shared/contracts/api'

export function IndustryDistributionPie({ distribution }: { distribution: IndustryDistributionItemDto[] }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current)
    }

    instanceRef.current.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['35%', '65%'],
        data: distribution.map((d) => ({ name: d.industryName, value: Math.round(d.totalValue) }))
      }]
    })

    return () => {
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
  }, [distribution])

  return <div ref={chartRef} style={{ width: '100%', height: 300 }} />
}
