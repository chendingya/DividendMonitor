import { Table, Tag, Typography } from 'antd'
import type { ComparisonRowDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function ComparisonTable({ items }: { items: ComparisonRowDto[] }) {
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
            render: (value: number) => value.toFixed(2)
          },
          {
            title: '市盈率',
            dataIndex: 'peRatio',
            render: (value?: number) => (value == null ? '--' : value.toFixed(2))
          },
          {
            title: '区间平均股息率',
            dataIndex: 'averageYield',
            render: (value?: number) => (value == null ? '-' : percent.format(value))
          },
          {
            title: '估算未来股息率',
            dataIndex: 'estimatedFutureYield',
            render: (value?: number) => (value == null ? '-' : percent.format(value))
          }
        ]}
      />
    </AppCard>
  )
}
