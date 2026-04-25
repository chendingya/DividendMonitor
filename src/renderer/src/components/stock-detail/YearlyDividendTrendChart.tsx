import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts'
import type { HistoricalYieldPointDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

type YearlyDividendTrendChartProps = {
  items: HistoricalYieldPointDto[]
}

export function YearlyDividendTrendChart({ items }: YearlyDividendTrendChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null)

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.year - b.year), [items])

  useEffect(() => {
    if (!chartRef.current) {
      return
    }

    const chart = echarts.init(chartRef.current)
    const labels = sortedItems.map((item) => `${item.year}`)
    const yields = sortedItems.map((item) => Number((item.yield * 100).toFixed(2)))
    const events = sortedItems.map((item) => item.events)

    chart.setOption({
      animation: false,
      grid: {
        left: 36,
        right: 20,
        top: 64,
        bottom: 28
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        top: 8,
        right: 8,
        itemWidth: 12,
        itemHeight: 12,
        textStyle: {
          color: '#66707a'
        }
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: {
          lineStyle: {
            color: 'rgba(171, 173, 175, 0.28)'
          }
        },
        axisLabel: {
          color: '#66707a'
        }
      },
      yAxis: [
        {
          type: 'value',
          name: '股息率 %',
          nameTextStyle: {
            color: '#66707a'
          },
          axisLabel: {
            color: '#66707a',
            formatter: '{value}%'
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(171, 173, 175, 0.12)'
            }
          }
        },
        {
          type: 'value',
          name: '分红次数',
          nameTextStyle: {
            color: '#8b949e'
          },
          axisLabel: {
            color: '#8b949e'
          },
          splitLine: {
            show: false
          }
        }
      ],
      series: [
        {
          name: '自然年股息率',
          type: 'bar',
          data: yields,
          barWidth: 22,
          itemStyle: {
            color: '#0052d0',
            borderRadius: [8, 8, 0, 0]
          }
        },
        {
          name: '分红次数',
          type: 'line',
          yAxisIndex: 1,
          data: events,
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: {
            color: '#9ec5ff',
            width: 3
          },
          itemStyle: {
            color: '#9ec5ff'
          }
        }
      ]
    })

    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(chartRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.dispose()
    }
  }, [sortedItems])

  return (
    <AppCard title="年度股息变化">
      <div style={{ marginBottom: 8, color: '#8b949e', fontSize: 12 }}>柱状图：自然年股息率；折线图：分红次数</div>
      <div style={{ marginBottom: 10, color: '#8b949e', fontSize: 12 }}>
        分红次数按自然年去重统计（同日同方案重复记录只计一次）。
      </div>
      <div ref={chartRef} style={{ width: '100%', height: 320 }} />
    </AppCard>
  )
}
