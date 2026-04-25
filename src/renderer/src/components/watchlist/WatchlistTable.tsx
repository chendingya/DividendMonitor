import { Typography } from 'antd'
import type { WatchlistItemDto } from '@shared/contracts/api'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

type WatchlistTableProps = {
  items: WatchlistItemDto[]
  removingSymbol?: string | null
  selectedSymbols?: string[]
  onOpenDetail?: (symbol: string) => void
  onRemove?: (symbol: string) => void
  onToggleSelect?: (symbol: string) => void
}

export function WatchlistTable({
  items,
  removingSymbol,
  selectedSymbols = [],
  onOpenDetail,
  onRemove,
  onToggleSelect
}: WatchlistTableProps) {
  if (items.length === 0) {
    return (
      <div className="ledger-data-card">
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          自选池暂时为空
        </Typography.Title>
        <Typography.Paragraph style={{ marginBottom: 0, color: '#66707a' }}>
          可先从搜索结果或个股详情页把股票加入自选，再回到这里持续跟踪收益机会。
        </Typography.Paragraph>
      </div>
    )
  }

  return (
    <div className="ledger-data-card">
      <div className="ledger-data-head">
        <span>资产名称</span>
        <span>预期收益</span>
        <span>最新价</span>
        <span>选择状态</span>
        <span>操作</span>
      </div>
      <div className="ledger-data-body">
        {items.map((record) => (
          <div className={`ledger-data-row ${selectedSymbols.includes(record.symbol) ? 'is-selected' : ''}`} key={record.symbol}>
            <div className="ledger-asset-cell">
              <div className="ledger-asset-badge">{record.symbol.slice(-2)}</div>
              <div>
                <Typography.Text strong>{record.name}</Typography.Text>
                <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>{record.symbol} · A股</div>
              </div>
            </div>
            <div className="ledger-highlight-value">
              {record.estimatedFutureYield == null ? '--' : percent.format(record.estimatedFutureYield)}
            </div>
            <div>{record.latestPrice.toFixed(2)}</div>
            <div>
              <button
                type="button"
                className={`ledger-inline-action-btn ${selectedSymbols.includes(record.symbol) ? 'is-selected' : ''}`}
                onClick={() => onToggleSelect?.(record.symbol)}
                disabled={!onToggleSelect}
              >
                {selectedSymbols.includes(record.symbol) ? '已选中' : '选择'}
              </button>
            </div>
            <div className="ledger-data-actions">
              <button
                type="button"
                className="ledger-inline-action-btn"
                onClick={() => onOpenDetail?.(record.symbol)}
                disabled={!onOpenDetail}
              >
                详情
              </button>
              <button
                type="button"
                className="ledger-inline-action-btn is-danger"
                onClick={() => onRemove?.(record.symbol)}
                disabled={!onRemove || removingSymbol === record.symbol}
              >
                {removingSymbol === record.symbol ? '移除中...' : '移除'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
