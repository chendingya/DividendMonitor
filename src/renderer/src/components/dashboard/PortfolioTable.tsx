import { Space, Table, Tag, Typography } from 'antd'
import { AppCard } from '@renderer/components/app/AppCard'
import { AssetAvatar } from '@renderer/components/app/AssetAvatar'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import type { PortfolioRow } from '@renderer/hooks/usePortfolio'

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2
})

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

type PortfolioTableProps = {
  rows: PortfolioRow[]
  onGoToDetail: (row: PortfolioRow) => void
  onEdit: (row: PortfolioRow) => void
  onRemove: (row: PortfolioRow) => void
}

export function PortfolioTable({ rows, onGoToDetail, onEdit, onRemove }: PortfolioTableProps) {
  return (
    <AppCard title="持仓明细" extra={<Typography.Text type="secondary">{rows.length} 条</Typography.Text>}>
      <p className="ledger-transaction-hint">同一资产可录入多笔买入/卖出交易，系统按净持仓与净成本汇总展示。</p>
      {rows.length === 0 ? (
        <PageStateBlock
          kind="empty"
          title="当前没有持仓"
          description={'可先搜索资产加入自选，或通过"录入持仓"记录你的股票、ETF 或基金仓位。'}
        />
      ) : (
        <Table
          className="soft-table"
          rowKey="id"
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: '资产',
              render: (_, record) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AssetAvatar name={record.name} assetType={record.assetType ?? 'STOCK'} size={32} />
                  <div>
                    <Space size={8}>
                      <Typography.Text strong>{record.name}</Typography.Text>
                      {record.transactionCount > 1 ? <Tag color="orange">多笔交易</Tag> : null}
                      {record.assetType ? <Tag color="blue">{record.assetType}</Tag> : null}
                    </Space>
                    <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>
                      {record.symbol ?? record.code ?? '无代码资产'}
                    </div>
                  </div>
                </div>
              )
            },
            {
              title: '份额/股数',
              render: (_, record) => `${record.netShares.toFixed(2)} (${record.transactionCount} 笔)`
            },
            {
              title: '成本价',
              dataIndex: 'avgCost',
              render: (value: number) => currency.format(value)
            },
            {
              title: '最新价',
              dataIndex: 'latestPrice',
              render: (value?: number) => (value == null ? '--' : currency.format(value))
            },
            {
              title: '持仓市值',
              dataIndex: 'marketValue',
              render: (value?: number) => (value == null ? '--' : currency.format(value))
            },
            {
              title: '收益率',
              dataIndex: 'positionReturn',
              render: (value?: number) => (value == null ? '--' : percent.format(value))
            },
            {
              title: '收益指标',
              render: (_, record) => (
                <div>
                  <div>{record.yieldMetric == null ? '--' : percent.format(record.yieldMetric)}</div>
                  <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>
                    {record.yieldLabel ?? '暂无口径'}
                  </div>
                </div>
              )
            },
            {
              title: '操作',
              render: (_, record) => (
                <Space className="ledger-inline-action-group">
                  <button
                    type="button"
                    className="ledger-inline-action-btn"
                    onClick={() => onGoToDetail(record)}
                    disabled={!record.assetKey && !record.symbol}
                  >
                    详情
                  </button>
                  <button type="button" className="ledger-inline-action-btn" onClick={() => onEdit(record)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className="ledger-inline-action-btn is-danger"
                    onClick={() => onRemove(record)}
                  >
                    删除
                  </button>
                </Space>
              )
            }
          ]}
        />
      )}
    </AppCard>
  )
}
