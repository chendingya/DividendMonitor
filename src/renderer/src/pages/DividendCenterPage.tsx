import { useEffect, useMemo, useRef, useState } from 'react'
import { DatePicker, Empty, Spin, Table, Tag, message } from 'antd'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import { AppCard } from '@renderer/components/app/AppCard'
import { ChartExportButton } from '@renderer/components/app/ChartExportButton'
import { dividendApi, type DividendHistoryResult } from '@renderer/services/dividendApi'
import type { UpcomingDividendDto, DividendForecastDto } from '@shared/contracts/api'

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2
})

const PRIMARY = '#0052d0'
const PRIMARY_LIGHT = '#2866eb'
const TEXT_SOFT = '#66707a'
const TEXT_FAINT = '#8b949e'
const DANGER = '#b31b25'

function DividendBarChart({ data }: { data: DividendHistoryResult['yearlySummary'] }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current)
    }
    const chart = instanceRef.current
    const sorted = [...data].sort((a, b) => a.year - b.year)
    chart.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const items = params as Array<{ name: string; value: number }>
          return items.map((p) => `${p.name}年<br/>分红总额：${currency.format(p.value)}`).join('<br/>')
        }
      },
      xAxis: {
        type: 'category',
        data: sorted.map((d) => String(d.year)),
        axisLabel: { formatter: '{value}年', color: TEXT_SOFT, fontSize: 12 },
        axisLine: { lineStyle: { color: '#e2e7ea' } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => `¥${v.toFixed(0)}`, color: TEXT_FAINT, fontSize: 11 },
        splitLine: { lineStyle: { color: '#eef1f3' } }
      },
      series: [{
        type: 'bar',
        data: sorted.map((d) => Math.round(d.totalAmount * 100) / 100),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: PRIMARY_LIGHT },
            { offset: 1, color: PRIMARY }
          ]),
          borderRadius: [6, 6, 0, 0]
        },
        barMaxWidth: 44
      }],
      grid: { left: 60, right: 20, top: 20, bottom: 30 }
    }, true)

    return () => {
      chart.dispose()
      instanceRef.current = null
    }
  }, [data])

  return (
    <div ref={chartRef} style={{ position: 'relative', width: '100%', height: 280 }}>
      <ChartExportButton instanceRef={instanceRef} filename="dividend-yearly-summary" />
    </div>
  )
}

function DividendTrendChart({ data }: { data: DividendHistoryResult['monthlyTrend'] }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current)
    }
    const chart = instanceRef.current

    let cumulative = 0
    const cumulativeData = data.map((d) => {
      cumulative += d.amount
      return Math.round(cumulative * 100) / 100
    })

    chart.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const items = params as Array<{ name: string; value: number; seriesIndex: number }>
          const month = items[0]?.name ?? ''
          const lines = items.map((p) =>
            p.seriesIndex === 0
              ? `当月分红：${currency.format(p.value)}`
              : `累计分红：${currency.format(p.value)}`
          )
          return `${month}<br/>${lines.join('<br/>')}`
        }
      },
      legend: {
        data: ['当月分红', '累计分红'],
        bottom: 0,
        textStyle: { color: TEXT_SOFT, fontSize: 12 }
      },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.month),
        axisLabel: { rotate: 30, fontSize: 11, color: TEXT_FAINT },
        axisLine: { lineStyle: { color: '#e2e7ea' } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => `¥${v.toFixed(0)}`, color: TEXT_FAINT, fontSize: 11 },
        splitLine: { lineStyle: { color: '#eef1f3' } }
      },
      series: [
        {
          name: '当月分红',
          type: 'bar',
          data: data.map((d) => Math.round(d.amount * 100) / 100),
          itemStyle: { color: '#dbe7ff', borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 22
        },
        {
          name: '累计分红',
          type: 'line',
          data: cumulativeData,
          smooth: true,
          lineStyle: { color: PRIMARY, width: 2 },
          itemStyle: { color: PRIMARY },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0,82,208,0.12)' },
              { offset: 1, color: 'rgba(0,82,208,0.01)' }
            ])
          }
        }
      ],
      grid: { left: 60, right: 20, top: 20, bottom: 50 }
    }, true)

    return () => {
      chart.dispose()
      instanceRef.current = null
    }
  }, [data])

  return (
    <div ref={chartRef} style={{ position: 'relative', width: '100%', height: 300 }}>
      <ChartExportButton instanceRef={instanceRef} filename="dividend-monthly-trend" />
    </div>
  )
}

function SummaryPanel({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <section className={`ledger-metric-panel${primary ? ' is-primary' : ''}`}>
      <div className="ledger-metric-label">{label}</div>
      <div className="ledger-metric-value" style={{ fontSize: 24 }}>{value}</div>
    </section>
  )
}

export function DividendCenterPage() {
  const [apiMessage, messageHolder] = message.useMessage()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DividendHistoryResult | null>(null)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [upcoming, setUpcoming] = useState<UpcomingDividendDto[]>([])
  const [forecast, setForecast] = useState<DividendForecastDto | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastError, setForecastError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    setLoading(true)
    const request = dateRange
      ? {
          fromDate: dateRange[0]?.format('YYYY-MM-DD'),
          toDate: dateRange[1]?.format('YYYY-MM-DD')
        }
      : undefined

    dividendApi.getHistory(request)
      .then((result) => {
        if (!disposed) setData(result)
      })
      .catch((err) => {
        if (!disposed) apiMessage.error(err instanceof Error ? err.message : '加载分红数据失败')
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })

    return () => { disposed = true }
  }, [dateRange])

  useEffect(() => {
    let cancelled = false
    setForecastLoading(true)
    setForecastError(null)
    Promise.all([dividendApi.listUpcoming(), dividendApi.getForecast()])
      .then(([u, f]) => {
        if (cancelled) return
        setUpcoming(u)
        setForecast(f)
      })
      .catch((err) => {
        if (cancelled) return
        setForecastError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setForecastLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const summaryCards = useMemo(() => {
    if (!data) return []
    const currentYear = new Date().getFullYear()
    const thisYearAmount = data.yearlySummary.find((y) => y.year === currentYear)?.totalAmount ?? 0
    const cards = [
      { label: '累计分红（估算）', value: currency.format(data.totalAmount), primary: true },
      { label: `${currentYear}年分红`, value: currency.format(thisYearAmount), primary: false },
      { label: '分红事件数', value: `${data.items.length} 次`, primary: false },
      { label: '涉及标的', value: `${data.assetSummary.length} 只`, primary: false }
    ]
    if (forecast) {
      cards.push(
        { label: `${forecast.year}全年估算`, value: currency.format(forecast.annualEstimatedTotal), primary: true },
        { label: `待入账（${forecast.details.upcoming.length}笔）`, value: currency.format(forecast.upcomingPlanned), primary: false },
        { label: '剩余估算', value: currency.format(forecast.remainingEstimated), primary: false }
      )
    }
    return cards
  }, [data, forecast])

  return (
    <div className="ledger-page" style={{ padding: '28px 32px' }}>
      {messageHolder}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#2c2f31', letterSpacing: '-0.03em' }}>
            分红统计中心
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: TEXT_SOFT }}>
            基于持仓标的买入日之后的历史分红方案，按持有股数估算分红收入
          </p>
        </div>
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(dates) => setDateRange(dates)}
          allowClear
          placeholder={['开始日期', '结束日期']}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" tip="加载分红数据..." />
        </div>
      ) : !data || data.items.length === 0 ? (
        <AppCard title="分红统计">
          <Empty description="暂无分红数据。请确保持仓中已填写买入日期，且标的有历史分红方案。" />
        </AppCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 汇总面板 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {summaryCards.map((card) => (
              <SummaryPanel key={card.label} label={card.label} value={card.value} primary={card.primary} />
            ))}
          </div>

          {/* 年度柱状图 */}
          <AppCard title="年度分红汇总">
            <DividendBarChart data={data.yearlySummary} />
          </AppCard>

          {/* 月度趋势 */}
          <AppCard title="月度分红趋势">
            <DividendTrendChart data={data.monthlyTrend} />
          </AppCard>

          {/* 个股排行 */}
          <AppCard title="个股分红排行">
            <Table
              className="soft-table"
              rowKey="assetKey"
              pagination={false}
              size="small"
              dataSource={data.assetSummary}
              columns={[
                {
                  title: '排名',
                  width: 60,
                  render: (_, __, index) => (
                    <span style={{
                      display: 'inline-block',
                      width: 22,
                      height: 22,
                      lineHeight: '22px',
                      textAlign: 'center',
                      borderRadius: '50%',
                      fontSize: 12,
                      fontWeight: 700,
                      background: index < 3 ? PRIMARY : '#eef1f3',
                      color: index < 3 ? '#fff' : TEXT_SOFT
                    }}>
                      {index + 1}
                    </span>
                  )
                },
                { title: '标的名称', dataIndex: 'assetName' },
                { title: '代码', dataIndex: 'code' },
                {
                  title: '累计分红（估算）',
                  dataIndex: 'totalAmount',
                  render: (v: number) => <span style={{ fontWeight: 700, color: '#2c2f31' }}>{currency.format(v)}</span>,
                  sorter: (a, b) => a.totalAmount - b.totalAmount,
                  defaultSortOrder: 'descend' as const
                },
                { title: '分红次数', dataIndex: 'eventCount' },
                { title: '最近除权日', dataIndex: 'latestExDate' }
              ]}
            />
          </AppCard>

          {/* 即将到账 */}
          <AppCard title="即将到账（已公告未除权除息）">
            {forecastLoading ? (
              <Spin />
            ) : forecastError ? (
              <Empty description={`加载失败：${forecastError}`} />
            ) : upcoming.length === 0 ? (
              <Empty description="当前无已公告未派发的分红预案" />
            ) : (
              <Table
                dataSource={upcoming}
                rowKey={(r) => `${r.assetKey}-${r.announceDate ?? ''}`}
                pagination={false}
                size="small"
                columns={[
                  { title: '标的', dataIndex: 'name', width: 140 },
                  { title: '代码', dataIndex: 'code', width: 100 },
                  { title: '持仓', dataIndex: 'heldShares', width: 90, align: 'right' as const },
                  { title: '预案公告日', dataIndex: 'announceDate', width: 120, render: (v?: string) => v ?? '—' },
                  { title: '计划除权日', dataIndex: 'expectedExDate', width: 120, render: (v?: string) => v ?? '待定' },
                  {
                    title: '方案进度',
                    dataIndex: 'announcementProgress',
                    width: 130,
                    render: (text: string, r: UpcomingDividendDto) => (
                      <Tag color={r.status === 'PLANNED' ? 'blue' : 'gold'}>{text}</Tag>
                    )
                  },
                  { title: '每股分红', dataIndex: 'dividendPerShare', width: 110, align: 'right' as const, render: (v: number) => v?.toFixed(4) },
                  {
                    title: '估算金额',
                    dataIndex: 'estimatedAmount',
                    width: 130,
                    align: 'right' as const,
                    render: (v: number) => currency.format(v)
                  }
                ]}
              />
            )}
          </AppCard>

          {/* 明细表 */}
          <AppCard title="分红明细">
            <Table
              className="soft-table"
              rowKey={(record) => `${record.assetKey}-${record.exDate}`}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
              size="small"
              dataSource={data.items}
              columns={[
                { title: '标的', dataIndex: 'assetName', width: 120 },
                { title: '代码', dataIndex: 'code', width: 80 },
                { title: '年份', dataIndex: 'year', width: 70 },
                { title: '除权除息日', dataIndex: 'exDate', width: 110 },
                {
                  title: '每股分红',
                  dataIndex: 'dividendPerShare',
                  width: 100,
                  render: (v: number) => v.toFixed(4)
                },
                {
                  title: '送转（每10股）',
                  width: 110,
                  render: (_, record) => {
                    const bonus = record.bonusSharePer10 ?? 0
                    const transfer = record.transferSharePer10 ?? 0
                    if (bonus === 0 && transfer === 0) return '--'
                    return `送${bonus} 转${transfer}`
                  }
                },
                {
                  title: '持股数',
                  dataIndex: 'heldShares',
                  width: 90,
                  render: (v: number) => v.toFixed(0)
                },
                {
                  title: '估算分红金额',
                  dataIndex: 'estimatedDividendAmount',
                  width: 120,
                  render: (v: number) => <span style={{ color: DANGER, fontWeight: 700 }}>{currency.format(v)}</span>
                }
              ]}
            />
          </AppCard>
        </div>
      )}
    </div>
  )
}
