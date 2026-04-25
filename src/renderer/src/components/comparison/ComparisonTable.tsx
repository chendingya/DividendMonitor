import { Space, Table, Tag, Typography } from 'antd'
import type { ComparisonRowDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function ComparisonTable({ items }: { items: ComparisonRowDto[] }) {
  const peValues = items.map((item) => item.peRatio).filter((value): value is number => value != null)
  const averageYieldValues = items.map((item) => item.averageYield).filter((value): value is number => value != null)
  const futureYieldValues = items.map((item) => item.estimatedFutureYield).filter((value): value is number => value != null)
  const highestFutureYield = futureYieldValues.length > 0 ? Math.max(...futureYieldValues) : undefined
  const lowestFutureYield = futureYieldValues.length > 0 ? Math.min(...futureYieldValues) : undefined
  const lowestPeRatio = peValues.length > 0 ? Math.min(...peValues) : undefined
  const highestAverageYield = averageYieldValues.length > 0 ? Math.max(...averageYieldValues) : undefined

  function renderMetricValue(
    value: number | undefined,
    formatter: (next: number) => string,
    options?: {
      highlightHigh?: number
      highlightLow?: number
    }
  ) {
    if (value == null) {
      return '-'
    }

    let className = 'comparison-metric-chip'
    if (options?.highlightHigh != null && value === options.highlightHigh) {
      className += ' is-positive'
    } else if (options?.highlightLow != null && value === options.highlightLow) {
      className += ' is-cautious'
    }

    return <span className={className}>{formatter(value)}</span>
  }

  return (
    <AppCard
      title={
        <span className="ledger-card-title-with-icon">
          <span className="ledger-card-title-icon">
            <svg className="ledger-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 5.5h16M4 12h9m-9 6.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="16.5" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </span>
          多股对比
        </span>
      }
      extra={<Tag color="blue">{items.length} 个标的</Tag>}
    >
      <Space wrap size={[8, 8]} style={{ marginBottom: 16 }}>
        <span className="pill primary">绿色高亮：当前列更优值</span>
        <span className="pill">红色高亮：当前列较弱值</span>
        <span className="pill">点击表头可排序</span>
      </Space>
      <Table
        className="soft-table"
        rowKey="symbol"
        pagination={false}
        dataSource={items}
        columns={[
          {
            title: '股票',
            render: (_, record) => (
              <div>
                <Typography.Text strong>{record.name}</Typography.Text>
                <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>{record.symbol}</div>
              </div>
            )
          },
          {
            title: '最新价',
            dataIndex: 'latestPrice',
            sorter: (a, b) => a.latestPrice - b.latestPrice,
            render: (value: number) => value.toFixed(2)
          },
          {
            title: '市盈率',
            dataIndex: 'peRatio',
            sorter: (a, b) => (a.peRatio ?? Number.POSITIVE_INFINITY) - (b.peRatio ?? Number.POSITIVE_INFINITY),
            render: (value?: number) =>
              renderMetricValue(value, (next) => next.toFixed(2), {
                highlightLow: lowestPeRatio
              })
          },
          {
            title: '区间平均股息率',
            dataIndex: 'averageYield',
            sorter: (a, b) => (a.averageYield ?? Number.NEGATIVE_INFINITY) - (b.averageYield ?? Number.NEGATIVE_INFINITY),
            render: (value?: number) =>
              renderMetricValue(value, (next) => percent.format(next), {
                highlightHigh: highestAverageYield
              })
          },
          {
            title: '估算未来股息率',
            dataIndex: 'estimatedFutureYield',
            defaultSortOrder: 'descend',
            sorter: (a, b) =>
              (a.estimatedFutureYield ?? Number.NEGATIVE_INFINITY) - (b.estimatedFutureYield ?? Number.NEGATIVE_INFINITY),
            render: (value?: number) =>
              renderMetricValue(value, (next) => percent.format(next), {
                highlightHigh: highestFutureYield,
                highlightLow: lowestFutureYield
              })
          }
        ]}
      />
    </AppCard>
  )
}
