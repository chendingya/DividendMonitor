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

let cachedSnapshot: HTMLCanvasElement | null = null

function snapshotFrom(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas')
  copy.width = source.width
  copy.height = source.height
  const ctx = copy.getContext('2d')
  if (ctx) {
    ctx.drawImage(source, 0, 0)
  }
  return copy
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
    const container = containerRef.current
    container.style.position = 'relative'

    let staleSnapshot: HTMLCanvasElement | null = null
    if (cachedSnapshot) {
      const snap = cachedSnapshot.cloneNode(true) as HTMLCanvasElement
      staleSnapshot = snap
      snap.dataset.snapshot = 'stale'
      snap.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0'
      container.appendChild(snap)
    }

    const chart = echarts.init(container)

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

    const timer = setTimeout(() => {
      try {
        const source = chart.getRenderedCanvas()
        const probe = document.createElement('canvas')
        probe.width = source.width
        probe.height = source.height
        const probeCtx = probe.getContext('2d')
        if (probeCtx) {
          probeCtx.drawImage(source, 0, 0)
          const pixels = probeCtx.getImageData(0, 0, probe.width, probe.height).data
          let painted = false
          for (let i = 3; i < pixels.length; i += 4096) {
            if (pixels[i] !== 0) {
              painted = true
              break
            }
          }
          if (painted) {
            cachedSnapshot = snapshotFrom(source)
          }
        }
      } catch {
        cachedSnapshot = null
      }
      staleSnapshot?.remove()
    }, 200)

    return () => {
      clearTimeout(timer)
      chart.dispose()
      staleSnapshot?.remove()
    }
  }, [industries, stocks, onSelectStock])

  return <div ref={containerRef} style={{ width: '100%', height: 560 }} />
}
