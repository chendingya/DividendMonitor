import { Typography } from 'antd'
import type { WatchlistEntryDto } from '@shared/contracts/api'
import { AssetAvatar } from '@renderer/components/app/AssetAvatar'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

type WatchlistTableProps = {
  items: WatchlistEntryDto[]
  removingAssetKey?: string | null
  selectedAssetKeys?: string[]
  onOpenDetail?: (assetKey: string) => void
  onRemove?: (assetKey: string) => void
  onToggleSelect?: (assetKey: string) => void
}

export function WatchlistTable({
  items,
  removingAssetKey,
  selectedAssetKeys = [],
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
          可先从搜索结果或详情页把资产加入自选，再回到这里持续跟踪收益机会。
        </Typography.Paragraph>
      </div>
    )
  }

  return (
    <div className="ledger-data-card">
      <div className="ledger-data-head">
        <span>资产名称</span>
        <span>收益指标</span>
        <span>最新价</span>
        <span>选择状态</span>
        <span>操作</span>
      </div>
      <div className="ledger-data-body">
        {items.map((record) => (
          <div className={`ledger-data-row ${selectedAssetKeys.includes(record.assetKey) ? 'is-selected' : ''}`} key={record.assetKey}>
            <div className="ledger-asset-cell">
              <AssetAvatar name={record.name} assetType={record.assetType} />
              <div>
                <Typography.Text strong>{record.name}</Typography.Text>
                <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>
                  {record.symbol ?? record.code} · {record.assetType}
                </div>
              </div>
            </div>
            <div className="ledger-highlight-value">
              {record.estimatedFutureYield != null
                ? percent.format(record.estimatedFutureYield)
                : record.averageYield != null
                  ? percent.format(record.averageYield)
                  : '--'}
              <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>{record.yieldLabel ?? '收益率'}</div>
            </div>
            <div>{record.latestPrice.toFixed(2)}</div>
            <div>
              <button
                type="button"
                className={`ledger-inline-action-btn ${selectedAssetKeys.includes(record.assetKey) ? 'is-selected' : ''}`}
                onClick={() => onToggleSelect?.(record.assetKey)}
                disabled={!onToggleSelect}
              >
                {selectedAssetKeys.includes(record.assetKey) ? '已选中' : '选择'}
              </button>
            </div>
            <div className="ledger-data-actions">
              <button
                type="button"
                className="ledger-inline-action-btn"
                onClick={() => onOpenDetail?.(record.assetKey)}
                disabled={!onOpenDetail}
              >
                详情
              </button>
              <button
                type="button"
                className="ledger-inline-action-btn is-danger"
                onClick={() => onRemove?.(record.assetKey)}
                disabled={!onRemove || removingAssetKey === record.assetKey}
              >
                {removingAssetKey === record.assetKey ? '移除中...' : '移除'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
