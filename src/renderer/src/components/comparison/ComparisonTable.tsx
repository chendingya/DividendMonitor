import { Space, Table, Tag, Typography } from 'antd'
import type { AssetComparisonRowDto, ValuationWindowKeyDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

type ComparisonTableProps = {
  items: AssetComparisonRowDto[]
  valuationWindow: ValuationWindowKeyDto
  onOpenDetail?: (assetKey: string) => void
}

export function resolveComparisonMetricClassName(
  value: number | undefined,
  options?: {
    highlightHigh?: number
    highlightLow?: number
  }
) {
  if (value == null) {
    return 'comparison-metric-chip'
  }

  const hasComparableRange =
    options?.highlightHigh != null && options?.highlightLow != null ? options.highlightHigh !== options.highlightLow : true
  if (!hasComparableRange) {
    return 'comparison-metric-chip'
  }

  if (options?.highlightHigh != null && value === options.highlightHigh) {
    return 'comparison-metric-chip is-positive'
  }
  if (options?.highlightLow != null && value === options.highlightLow) {
    return 'comparison-metric-chip is-cautious'
  }

  return 'comparison-metric-chip'
}

function getWindowPercentile(record: AssetComparisonRowDto, metric: 'pe' | 'pb', window: ValuationWindowKeyDto) {
  return record.valuation?.[metric]?.windows.find((item) => item.window === window)?.percentile
}

export function ComparisonTable({ items, valuationWindow, onOpenDetail }: ComparisonTableProps) {
  const peValues = items.map((item) => item.peRatio).filter((value): value is number => value != null)
  const pbValues = items.map((item) => item.pbRatio).filter((value): value is number => value != null)
  const averageYieldValues = items.map((item) => item.averageYield).filter((value): value is number => value != null)
  const futureYieldValues = items.map((item) => item.estimatedFutureYield).filter((value): value is number => value != null)
  const volatilityValues = items.map((item) => item.annualVolatility).filter((value): value is number => value != null)
  const sharpeValues = items.map((item) => item.sharpeRatio).filter((value): value is number => value != null)
  const pePercentileValues = items
    .map((item) => getWindowPercentile(item, 'pe', valuationWindow))
    .filter((value): value is number => value != null)
  const pbPercentileValues = items
    .map((item) => getWindowPercentile(item, 'pb', valuationWindow))
    .filter((value): value is number => value != null)
  const highestFutureYield = futureYieldValues.length > 0 ? Math.max(...futureYieldValues) : undefined
  const lowestFutureYield = futureYieldValues.length > 0 ? Math.min(...futureYieldValues) : undefined
  const lowestPeRatio = peValues.length > 0 ? Math.min(...peValues) : undefined
  const highestPeRatio = peValues.length > 0 ? Math.max(...peValues) : undefined
  const lowestPbRatio = pbValues.length > 0 ? Math.min(...pbValues) : undefined
  const highestPbRatio = pbValues.length > 0 ? Math.max(...pbValues) : undefined
  const lowestPePercentile = pePercentileValues.length > 0 ? Math.min(...pePercentileValues) : undefined
  const highestPePercentile = pePercentileValues.length > 0 ? Math.max(...pePercentileValues) : undefined
  const lowestPbPercentile = pbPercentileValues.length > 0 ? Math.min(...pbPercentileValues) : undefined
  const highestPbPercentile = pbPercentileValues.length > 0 ? Math.max(...pbPercentileValues) : undefined
  const highestAverageYield = averageYieldValues.length > 0 ? Math.max(...averageYieldValues) : undefined
  const lowestAverageYield = averageYieldValues.length > 0 ? Math.min(...averageYieldValues) : undefined
  const lowestVolatility = volatilityValues.length > 0 ? Math.min(...volatilityValues) : undefined
  const highestVolatility = volatilityValues.length > 0 ? Math.max(...volatilityValues) : undefined
  const highestSharpe = sharpeValues.length > 0 ? Math.max(...sharpeValues) : undefined
  const lowestSharpe = sharpeValues.length > 0 ? Math.min(...sharpeValues) : undefined

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

    const className = resolveComparisonMetricClassName(value, options)
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
          多资产对比
        </span>
      }
      extra={<Tag color="blue">{items.length} 个资产</Tag>}
    >
      <Space wrap size={[8, 8]} style={{ marginBottom: 16 }}>
        <span className="pill primary">绿色高亮：当前列更优值</span>
        <span className="pill">红色高亮：当前列较弱值</span>
        <span className="pill">{valuationWindow === '10Y' ? '显示近 10 年分位' : '显示近 20 年分位'}</span>
      </Space>
      <Table
        className="soft-table"
        rowKey="assetKey"
        pagination={false}
        scroll={{ x: 1180 }}
        dataSource={items}
        columns={[
          {
            title: '标的',
            render: (_, record) => (
              <div>
                <Typography.Text strong>{record.name}</Typography.Text>
                <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>
                  {record.symbol ?? record.code} · {record.assetType}
                </div>
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
                highlightHigh: lowestPeRatio,
                highlightLow: highestPeRatio
              })
          },
          {
            title: '市净率',
            dataIndex: 'pbRatio',
            sorter: (a, b) => (a.pbRatio ?? Number.POSITIVE_INFINITY) - (b.pbRatio ?? Number.POSITIVE_INFINITY),
            render: (value?: number) =>
              renderMetricValue(value, (next) => next.toFixed(2), {
                highlightHigh: lowestPbRatio,
                highlightLow: highestPbRatio
              })
          },
          {
            title: `PE ${valuationWindow}分位`,
            sorter: (a, b) =>
              (getWindowPercentile(a, 'pe', valuationWindow) ?? Number.POSITIVE_INFINITY) -
              (getWindowPercentile(b, 'pe', valuationWindow) ?? Number.POSITIVE_INFINITY),
            render: (_, record) =>
              renderMetricValue(getWindowPercentile(record, 'pe', valuationWindow), (next) => `${next.toFixed(2)}%`, {
                highlightHigh: lowestPePercentile,
                highlightLow: highestPePercentile
              })
          },
          {
            title: `PB ${valuationWindow}分位`,
            sorter: (a, b) =>
              (getWindowPercentile(a, 'pb', valuationWindow) ?? Number.POSITIVE_INFINITY) -
              (getWindowPercentile(b, 'pb', valuationWindow) ?? Number.POSITIVE_INFINITY),
            render: (_, record) =>
              renderMetricValue(getWindowPercentile(record, 'pb', valuationWindow), (next) => `${next.toFixed(2)}%`, {
                highlightHigh: lowestPbPercentile,
                highlightLow: highestPbPercentile
              })
          },
          {
            title: '区间平均股息率',
            dataIndex: 'averageYield',
            sorter: (a, b) => (a.averageYield ?? Number.NEGATIVE_INFINITY) - (b.averageYield ?? Number.NEGATIVE_INFINITY),
            render: (value?: number) =>
              renderMetricValue(value, (next) => percent.format(next), {
                highlightHigh: highestAverageYield,
                highlightLow: lowestAverageYield
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
          },
          {
            title: '年化波动率',
            dataIndex: 'annualVolatility',
            sorter: (a, b) =>
              (a.annualVolatility ?? Number.POSITIVE_INFINITY) - (b.annualVolatility ?? Number.POSITIVE_INFINITY),
            render: (value?: number) =>
              renderMetricValue(value, (next) => percent.format(next), {
                highlightHigh: lowestVolatility,
                highlightLow: highestVolatility
              })
          },
          {
            title: '夏普比率',
            dataIndex: 'sharpeRatio',
            sorter: (a, b) => (a.sharpeRatio ?? Number.NEGATIVE_INFINITY) - (b.sharpeRatio ?? Number.NEGATIVE_INFINITY),
            render: (value?: number) =>
              renderMetricValue(value, (next) => next.toFixed(2), {
                highlightHigh: highestSharpe,
                highlightLow: lowestSharpe
              })
          },
          {
            title: '操作',
            align: 'right',
            render: (_, record) => (
              <button
                type="button"
                className="ledger-inline-action-btn"
                onClick={() => onOpenDetail?.(record.assetKey)}
                disabled={!onOpenDetail}
              >
                查看详情
              </button>
            )
          }
        ]}
      />
    </AppCard>
  )
}
