import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { BacktestResultDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

function buildReturnSeries(result: BacktestResultDto) {
  const points: Array<{ date: string; pct: number }> = []

  let shares = result.initialShares
  let totalCost = result.initialCost
  let lastPrice = result.buyPrice
  let totalDividendsPaid = 0

  points.push({ date: result.buyDate, pct: 0 })

  for (const tx of result.transactions) {
    if (tx.type === 'BUY' && tx.date === result.buyDate) {
      if (tx.price) lastPrice = tx.price
      continue
    }

    if (tx.price) lastPrice = tx.price

    if (tx.type === 'DCA_BUY') {
      shares = tx.sharesAfter
      totalCost += (tx.cashAmount ?? 0) + (tx.fee ?? 0)
    }
    if (tx.type === 'REINVEST') {
      shares = tx.sharesAfter
      totalCost += (tx.fee ?? 0)
    }
    if (tx.type === 'BONUS_ADJUSTMENT') {
      shares = tx.sharesAfter
    }
    if (tx.type === 'DIVIDEND') {
      totalDividendsPaid += tx.cashAmount ?? 0
    }

    const currentValue = shares * lastPrice + totalDividendsPaid
    const pct = totalCost > 0 ? (currentValue / totalCost - 1) * 100 : 0

    // 同一天可能有多笔交易（分红到账 + 复投），取最后一笔
    if (points.length > 0 && points[points.length - 1].date === tx.date) {
      points[points.length - 1] = { date: tx.date, pct }
    } else {
      points.push({ date: tx.date, pct })
    }
  }

  // 期末最终点
  const finalPct = result.totalReturn * 100
  if (points.length > 0 && points[points.length - 1].date === result.finalDate) {
    points[points.length - 1] = { date: result.finalDate, pct: finalPct }
  } else {
    points.push({ date: result.finalDate, pct: finalPct })
  }

  return points
}

export function BacktestNavChart({ result }: { result: BacktestResultDto }) {
  const chartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    const strategyPoints = buildReturnSeries(result)
    const labels = strategyPoints.map((p) => p.date)
    const returns = strategyPoints.map((p) => Number(p.pct.toFixed(2)))

    const chart = echarts.init(chartRef.current)

    const series: Array<Record<string, unknown>> = [
      {
        name: '累计收益率',
        type: 'line',
        data: returns,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#0052d0', width: 2.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0,82,208,0.18)' },
            { offset: 1, color: 'rgba(0,82,208,0)' }
          ])
        }
      }
    ]

    const legends = ['累计收益率']

    // Benchmark line — prefer per-point timeline from backend, fall back to endpoint interpolation
    const benchLabel = result.benchmarkSymbol ?? '基准'
    let benchData: (number | null)[] | null = null

    if (result.benchmarkTimeline && result.benchmarkTimeline.length > 0) {
      const benchByDate = new Map<string, number>()
      for (const pt of result.benchmarkTimeline) {
        benchByDate.set(pt.date, pt.cumulativeReturn * 100)
      }
      let lastBenchPct = 0
      benchData = []
      for (const date of labels) {
        const exact = benchByDate.get(date)
        if (exact !== undefined) lastBenchPct = exact
        benchData.push(Number(lastBenchPct.toFixed(2)))
      }
    } else if (result.benchmarkReturn != null) {
      // Fallback: linear interpolation from 0 to final benchmarkReturn
      benchData = labels.map((_d, i) => {
        const t = labels.length > 1 ? i / (labels.length - 1) : 1
        return Number((result.benchmarkReturn! * 100 * t).toFixed(2))
      })
      // Override the description text when using fallback
    }

    if (benchData) {
      legends.push(benchLabel)
      series.push({
        name: benchLabel,
        type: 'line',
        data: benchData,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#e04352', width: 2.5, type: 'dashed' },
        itemStyle: { color: '#e04352' }
      })
    }

    chart.setOption({
      animation: false,
      grid: {
        left: 52,
        right: 30,
        top: 56,
        bottom: 64
      },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: unknown) => {
          if (typeof v === 'number') return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
          return String(v)
        }
      },
      legend: {
        top: 8,
        right: 8,
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { color: '#66707a' }
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: 'rgba(171, 173, 175, 0.28)' } },
        axisLabel: { color: '#66707a', rotate: 30 }
      },
      yAxis: {
        type: 'value',
        name: '收益率',
        nameTextStyle: { color: '#66707a' },
        axisLabel: { color: '#66707a', formatter: '{value}%' },
        splitLine: { lineStyle: { color: 'rgba(171, 173, 175, 0.12)' } }
      },
      series
    })

    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(chartRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.dispose()
    }
  }, [result])

  return (
    <AppCard title="回测收益走势">
      <div style={{ marginBottom: 8, color: '#8b949e', fontSize: 12 }}>
        折线图：持仓市值（含已到账分红）相对初始投入的累计收益率。
      </div>
      {result.benchmarkReturn != null && (
        <div style={{ marginBottom: 10, color: '#8b949e', fontSize: 12 }}>
          虚线为基准指数（{result.benchmarkSymbol ?? '基准'}）同期累计收益率。
        </div>
      )}
      <div ref={chartRef} style={{ width: '100%', height: 380 }} />
    </AppCard>
  )
}
