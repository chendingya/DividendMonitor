import { Typography } from 'antd'
import type { WatchlistItemDto } from '@shared/contracts/api'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function WatchlistTable({ items }: { items: WatchlistItemDto[] }) {
  if (items.length === 0) {
    return (
      <div className="ledger-data-card">
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          自选池暂时为空
        </Typography.Title>
        <Typography.Paragraph style={{ marginBottom: 0, color: '#66707a' }}>
          目前后端已经切换到真实数据链路，下一步会补上本地持久化自选管理。这里先保留风格化空态。
        </Typography.Paragraph>
      </div>
    )
  }

  return (
    <div className="ledger-data-card">
      <div className="ledger-data-head">
        <span>资产名称</span>
        <span>预期收益</span>
        <span>频率</span>
        <span>状态标签</span>
        <span>走势</span>
      </div>
      <div className="ledger-data-body">
        {items.map((record) => (
          <div className="ledger-data-row" key={record.symbol}>
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
            <div>年度</div>
            <div>
              <span className="pill primary">
                <span className="ledger-pill-icon" aria-hidden="true">
                  <svg className="ledger-icon-svg" viewBox="0 0 24 24" fill="none">
                    <path d="M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M6 15l3-4 3 2 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                跟踪中
              </span>
            </div>
            <div style={{ color: '#0052d0', fontWeight: 800 }}>~</div>
          </div>
        ))}
      </div>
    </div>
  )
}
