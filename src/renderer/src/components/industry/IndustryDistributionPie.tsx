import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { IndustryDistributionItemDto } from '@shared/contracts/api'

export function buildIndustryPieOption(distribution: IndustryDistributionItemDto[], hideAmounts: boolean) {
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; value: number; percent: number }) =>
        hideAmounts
          ? `${params.name}: ${params.percent}%`
          : `${params.name}: ${params.value} (${params.percent}%)`
    },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      data: distribution.map((d) => ({ name: d.industryName, value: Math.round(d.totalValue) }))
    }]
  }
}

export function IndustryDistributionPie({
  distribution,
  hideAmounts = false
}: {
  distribution: IndustryDistributionItemDto[]
  hideAmounts?: boolean
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current)
    }

    instanceRef.current.setOption(buildIndustryPieOption(distribution, hideAmounts), { notMerge: true })

    return () => {
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
  }, [distribution, hideAmounts])

  return <div ref={chartRef} style={{ width: '100%', height: 300 }} />
}
