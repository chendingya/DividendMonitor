import { Space, Table, Tag, Typography } from 'antd'
import { AppCard } from '@renderer/components/app/AppCard'
import { AssetAvatar } from '@renderer/components/app/AssetAvatar'
import { AssetGroupPopover } from '@renderer/components/app/AssetGroupPopover'
import { LedgerIcon } from '@renderer/components/app/LedgerUi'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import type { PortfolioRow, PortfolioTransaction } from '@renderer/hooks/usePortfolio'
import type { WatchlistGroupDto } from '@shared/contracts/api'

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3
})

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

type PortfolioTableProps = {
  rows: PortfolioRow[]
  groups: WatchlistGroupDto[]
  getAssetGroupIds: (assetKey: string) => Promise<string[]>
  onToggleAssetGroup: (assetKey: string, groupId: string, add: boolean) => Promise<void>
  onGoToDetail: (row: PortfolioRow) => void
  onEdit: (row: PortfolioRow) => void
  onRemove: (row: PortfolioRow) => void
  onEditTransaction?: (row: PortfolioRow, transaction: PortfolioTransaction) => void
  onRemoveTransaction?: (row: PortfolioRow, transaction: PortfolioTransaction) => void
}

export function PortfolioTable({
  rows,
  groups,
  getAssetGroupIds,
  onToggleAssetGroup,
  onGoToDetail,
  onEdit,
  onRemove,
  onEditTransaction,
  onRemoveTransaction
}: PortfolioTableProps) {
  return (
    <AppCard title="持仓明细" extra={<Typography.Text type="secondary">{rows.length} 条</Typography.Text>}>
      <p className="ledger-transaction-hint">同一资产可录入多笔买入/卖出交易，系统按净持仓与净成本汇总展示。点击行前箭头展开查看每笔明细。</p>
      {rows.length === 0 ? (
        <PageStateBlock
          kind="empty"
          title="当前没有持仓"
          description={'可先搜索资产加入自选，或通过"录入持仓"记录你的股票、ETF、基金或贵金属仓位。'}
        />
      ) : (
        <Table
          className="soft-table"
          rowKey="id"
          pagination={false}
          dataSource={rows}
          expandable={{
            rowExpandable: (record) => record.transactionCount > 1,
            expandedRowRender: (record) => (
              <div style={{ padding: '4px 0' }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                  共 {record.transactionCount} 笔交易明细
                </Typography.Text>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#8b949e', fontSize: 12 }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>方向</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 500 }}>股数</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 500 }}>成交价</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>买入日期</th>
                      <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 500 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.transactions.map((tx) => (
                      <tr key={tx.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <Tag color={tx.direction === 'BUY' ? 'green' : 'red'} style={{ margin: 0 }}>
                            {tx.direction === 'BUY' ? '买入' : '卖出'}
                          </Tag>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{tx.shares.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{currency.format(tx.tradePrice ?? tx.avgCost)}</td>
                        <td style={{ padding: '6px 8px' }}>{tx.openedAt ?? '--'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <Space size={4}>
                            {onEditTransaction && (
                              <button
                                type="button"
                                className="ledger-inline-action-btn ledger-icon-only"
                                onClick={() => onEditTransaction(record, tx)}
                                title="编辑此笔"
                              >
                                <LedgerIcon name="edit" />
                              </button>
                            )}
                            {onRemoveTransaction && (
                              <button
                                type="button"
                                className="ledger-inline-action-btn ledger-icon-only is-danger"
                                onClick={() => onRemoveTransaction(record, tx)}
                                title="删除此笔"
                              >
                                <LedgerIcon name="delete" />
                              </button>
                            )}
                          </Space>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }}
          columns={[
            {
              title: '资产',
              render: (_, record) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AssetAvatar name={record.name} assetType={record.assetType ?? 'STOCK'} size={32} />
                  <div>
                    <Typography.Text strong>{record.name}</Typography.Text>
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
              title: '买入日期',
              dataIndex: 'openedAt',
              render: (value?: string) => (value ? value : '--')
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
              title: '预期分红率',
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
                  <AssetGroupPopover
                    assetKey={record.assetKey ?? ''}
                    groups={groups}
                    getAssetGroupIds={getAssetGroupIds}
                    onToggle={(groupId, add) => onToggleAssetGroup(record.assetKey ?? '', groupId, add)}
                  />
                  <button
                    type="button"
                    className="ledger-inline-action-btn ledger-icon-only"
                    onClick={() => onGoToDetail(record)}
                    disabled={!record.assetKey && !record.symbol}
                    title="查看详情"
                  >
                    <LedgerIcon name="detail" />
                  </button>
                  <button
                    type="button"
                    className="ledger-inline-action-btn ledger-icon-only"
                    onClick={() => onEdit(record)}
                    title="编辑持仓"
                  >
                    <LedgerIcon name="edit" />
                  </button>
                  <button
                    type="button"
                    className="ledger-inline-action-btn ledger-icon-only is-danger"
                    onClick={() => onRemove(record)}
                    title="删除持仓"
                  >
                    <LedgerIcon name="delete" />
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
