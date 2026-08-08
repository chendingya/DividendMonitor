import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { ScatterChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { CrossAssetPointDto } from '@shared/contracts/api'

echarts.use([ScatterChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer])

type Props = {
  points: CrossAssetPointDto[]
  riskFreeRatePercent: number
  onSelect: (point: CrossAssetPointDto) => void
}

const STOCK_COLOR = '#0052d0'
const HOUSING_COLOR = '#d97706'

function toChartPoint(point: CrossAssetPointDto) {
  return {
    value: [point.volatilityPercent, point.yieldPercent],
    raw: point
  }
}

export function CrossAssetScatterChart({ points, riskFreeRatePercent, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const chart = echarts.init(container)

    const stockPoints = points
      .filter(
        (point) =>
          point.kind === 'stock' &&
          point.yieldPercent != null &&
          point.volatilityPercent != null
      )
      .map(toChartPoint)
    const housingPoints = points
      .filter(
        (point) =>
          point.kind === 'housing' &&
          point.yieldPercent != null &&
          point.volatilityPercent != null
      )
      .map(toChartPoint)

    chart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (params: { data: { raw: CrossAssetPointDto } }) => {
          const point = params.data.raw
          const kindLabel = point.kind === 'stock' ? '股票/ETF/基金' : '房产'
          return [
            `<strong>${point.name}</strong>`,
            `类型：${kindLabel}`,
            `收益率：${point.yieldPercent?.toFixed(2) ?? '--'}%（${point.yieldLabel ?? ''}）`,
            `年化波动率：${point.volatilityPercent?.toFixed(2) ?? '--'}%`,
            point.subInfo ? `备注：${point.subInfo}` : ''
          ]
            .filter(Boolean)
            .join('<br/>')
        }
      },
      grid: { left: 56, right: 28, top: 40, bottom: 48 },
      xAxis: {
        name: '年化波动率（%）',
        nameLocation: 'middle',
        nameGap: 30,
        type: 'value',
        scale: true,
        axisLabel: { formatter: '{value}%' }
      },
      yAxis: {
        name: '收益率（%）',
        nameLocation: 'middle',
        nameGap: 42,
        type: 'value',
        scale: true,
        axisLabel: { formatter: '{value}%' }
      },
      series: [
        {
          name: '股票',
          type: 'scatter',
          data: stockPoints,
          symbolSize: 14,
          itemStyle: { color: STOCK_COLOR, opacity: 0.85 },
          markLine: {
            silent: true,
            symbol: 'none',
            label: {
              formatter: `无风险利率 ${riskFreeRatePercent.toFixed(1)}%`,
              position: 'insideEndTop',
              color: '#66707a',
              fontSize: 12
            },
            lineStyle: { type: 'dashed', color: '#b6bcc4', width: 1 },
            data: [{ yAxis: riskFreeRatePercent }]
          }
        },
        {
          name: '房产',
          type: 'scatter',
          data: housingPoints,
          symbolSize: 16,
          itemStyle: { color: HOUSING_COLOR, opacity: 0.85 }
        }
      ],
      animation: false
    })

    chart.on('click', (params) => {
      const data = params.data as { raw?: CrossAssetPointDto }
      if (data.raw) {
        onSelect(data.raw)
      }
    })

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [onSelect, points, riskFreeRatePercent])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 460, minHeight: 320 }}
      aria-label="跨资产收益风险散点图"
    />
  )
}
