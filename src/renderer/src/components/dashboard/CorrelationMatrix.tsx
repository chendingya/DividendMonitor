import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { AppCard } from '@renderer/components/app/AppCard'
import type { PortfolioCorrelationMatrixDto, PortfolioCommonDateRangeDto } from '@shared/contracts/api'

type CorrelationMatrixProps = {
  data: PortfolioCorrelationMatrixDto | undefined
  dateRange?: PortfolioCommonDateRangeDto | undefined
}

export function CorrelationMatrix({ data, dateRange }: CorrelationMatrixProps) {
  const chartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!data || data.assetKeys.length < 2) return
    if (!chartRef.current) return

    const chart = echarts.init(chartRef.current)
    const labels = data.names.map((name, idx) => {
      const base = name.length > 8 ? `${name.slice(0, 7)}…` : name
      return `${base}\n(${idx + 1})`
    })

    const maxLabelLen = Math.max(...data.names.map((n) => n.length))
    const gridLeft = maxLabelLen > 8 ? 120 : maxLabelLen > 4 ? 90 : 70
    const labelFontSize = maxLabelLen > 8 ? 10 : 11

    const seriesData: Array<[number, number, number]> = []
    for (let i = 0; i < data.matrix.length; i++) {
      for (let j = 0; j < data.matrix[i].length; j++) {
        seriesData.push([j, i, Number(data.matrix[i][j].toFixed(3))])
      }
    }

    const maxVal = Math.max(...seriesData.map((d) => d[2]))
    const minVal = Math.min(...seriesData.map((d) => d[2]))

    chart.setOption({
      tooltip: {
        position: 'top',
        formatter: (params: { data: [number, number, number] }) => {
          const [x, y, val] = params.data
          const nameX = data.names[x] ?? data.assetKeys[x]
          const nameY = data.names[y] ?? data.assetKeys[y]
          return `${nameY} × ${nameX}<br/>Pearson 相关系数：${val.toFixed(4)}`
        }
      },
      grid: { left: gridLeft, top: 10, right: 30, bottom: 60 },
      xAxis: {
        type: 'category',
        data: labels,
        position: 'bottom',
        axisLabel: { fontSize: labelFontSize, interval: 0 },
        splitArea: { show: true }
      },
      yAxis: {
        type: 'category',
        data: labels,
        axisLabel: { fontSize: labelFontSize, interval: 0 },
        splitArea: { show: true }
      },
      visualMap: {
        min: minVal,
        max: maxVal,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: {
          color: ['#1677ff', '#e8f4fd', '#ffffff', '#fff1f0', '#cf1322']
        },
        text: ['高', '低'],
        textStyle: { fontSize: 11 }
      },
      series: [
        {
          name: 'Pearson 相关系数',
          type: 'heatmap',
          data: seriesData,
          label: {
            show: true,
            fontSize: 11,
            formatter: (params: { data: [number, number, number] }) =>
              params.data[2].toFixed(2)
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    })

    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      chart.dispose()
    }
  }, [data])

  if (!data || data.assetKeys.length < 2) {
    return null
  }

  const dateRangeText = dateRange
    ? `${dateRange.start} 至 ${dateRange.end}（${dateRange.tradingDays} 个共同交易日）`
    : null

  return (
    <AppCard title="持仓相关性矩阵">
      <p style={{ color: '#66707a', fontSize: 13, marginBottom: dateRangeText ? 6 : 12 }}>
        基于持仓市权重合交易日的日收益率计算 Pearson 相关系数。对角线为 1.0，红色越深表示正相关性越强，蓝色越深表示负相关性越强。
      </p>
      {dateRangeText ? (
        <p style={{ color: '#8b949e', fontSize: 12, marginBottom: 12 }}>
          计算周期：{dateRangeText}
        </p>
      ) : null}
      <div ref={chartRef} style={{ width: '100%', height: 380 }} />
    </AppCard>
  )
}
