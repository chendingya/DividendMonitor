import { useRef, useEffect } from 'react'
import * as echarts from 'echarts/core'
import { TreemapChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { YieldMapIndustryDto, YieldMapStockDto } from '@shared/contracts/api'

echarts.use([TreemapChart, TooltipComponent, CanvasRenderer])

type Props = {
  industries: YieldMapIndustryDto[]
  stocks: YieldMapStockDto[]
  onSelectStock: (symbol: string) => void
}

function yieldColor(yieldTtm: number): string {
  if (yieldTtm <= 0) return '#8b949e'
  if (yieldTtm < 0.02) return '#6ba3d6'
  if (yieldTtm < 0.035) return '#2ea86b'
  if (yieldTtm < 0.05) return '#f0b429'
  if (yieldTtm < 0.07) return '#e8773e'
  return '#b31b25'
}

export function YieldMapTreemap({ industries, stocks, onSelectStock }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current)

    const byIndustry = new Map<string, YieldMapStockDto[]>()
    for (const stock of stocks) {
      const list = byIndustry.get(stock.industry) ?? []
      list.push(stock)
      byIndustry.set(stock.industry, list)
    }

    chart.setOption({
      tooltip: {
        formatter: (params: { name: string; data: unknown }) => {
          const data = params.data as { yieldTtm?: number }
          return `${params.name}<br/>股息率(TTM): ${data.yieldTtm != null ? (data.yieldTtm * 100).toFixed(2) + '%' : '--'}`
        }
      },
      series: [
        {
          type: 'treemap',
          roam: false,
          animation: false,
          animationDurationUpdate: 0,
          nodeClick: 'zoomToNode',
          breadcrumb: { show: true, height: 24 },
          label: { show: true, formatter: '{b}' },
          upperLabel: { show: true, height: 24, formatter: '{b}' },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1, gapWidth: 2 },
          levels: [
            {
              itemStyle: { borderColor: '#ffffff', borderWidth: 3, gapWidth: 3 }
            },
            {
              colorSaturation: [0.35, 0.5],
              itemStyle: { borderColor: '#ffffff', borderWidth: 1, gapWidth: 1 }
            }
          ],
          data: industries.map((industry) => ({
            name: industry.industry,
            value: industry.stockCount,
            itemStyle: { color: yieldColor(industry.medianYield) },
            children: (byIndustry.get(industry.industry) ?? []).map((stock) => ({
              name: `${stock.name} (${stock.symbol})`,
              value: 1 + stock.yieldTtm * 20,
              symbol: stock.symbol,
              yieldTtm: stock.yieldTtm,
              itemStyle: { color: yieldColor(stock.yieldTtm) }
            }))
          }))
        }
      ]
    })

    chart.on('click', (params) => {
      const data = params.data as { symbol?: string }
      if (data.symbol) {
        onSelectStock(data.symbol)
      }
    })

    return () => {
      chart.dispose()
    }
  }, [industries, stocks, onSelectStock])

  return <div ref={containerRef} style={{ width: '100%', height: 560 }} />
}
