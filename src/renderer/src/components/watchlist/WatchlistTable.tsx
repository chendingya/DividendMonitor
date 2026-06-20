import { Typography, Popover } from 'antd'
import { useState } from 'react'
import type { WatchlistEntryDto, WatchlistGroupDto } from '@shared/contracts/api'
import { AssetAvatar } from '@renderer/components/app/AssetAvatar'
import { LedgerIcon } from '@renderer/components/app/LedgerUi'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

type WatchlistTableProps = {
  items: WatchlistEntryDto[]
  removingAssetKey?: string | null
  selectedAssetKeys?: string[]
  groups: WatchlistGroupDto[]
  getAssetGroupIds: (assetKey: string) => Promise<string[]>
  onToggleAssetGroup: (assetKey: string, groupId: string, add: boolean) => Promise<void>
  onOpenDetail?: (assetKey: string) => void
  onRemove?: (assetKey: string) => void
  onToggleSelect?: (assetKey: string) => void
}

function AssetGroupPopover({
  assetKey,
  groups,
  getAssetGroupIds,
  onToggle
}: {
  assetKey: string
  groups: WatchlistGroupDto[]
  getAssetGroupIds: (assetKey: string) => Promise<string[]>
  onToggle: (groupId: string, add: boolean) => Promise<void>
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const loadGroupIds = async () => {
    setLoading(true)
    try {
      const ids = await getAssetGroupIds(assetKey)
      setChecked(new Set(ids))
    } catch {
      setChecked(new Set())
    } finally {
      setLoading(false)
    }
  }

  const toggleGroup = async (groupId: string) => {
    const wasChecked = checked.has(groupId)
    const next = new Set(checked)
    if (wasChecked) {
      next.delete(groupId)
    } else {
      next.add(groupId)
    }
    setChecked(next)

    try {
      await onToggle(groupId, !wasChecked)
    } catch {
      setChecked(checked)
    }
  }

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      onOpenChange={(open) => { if (open) void loadGroupIds() }}
      content={
        <div style={{ minWidth: 160, maxWidth: 220 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint, #8b949e)', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            分组
          </div>
          {loading ? (
            <div style={{ fontSize: 12, color: '#8b949e', padding: '8px 0' }}>加载中...</div>
          ) : groups.length === 0 ? (
            <div style={{ fontSize: 12, color: '#8b949e', padding: '4px 0' }}>暂无分组，请先创建</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {groups.map((group) => (
                <label
                  key={group.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text-main)',
                    userSelect: 'none',
                    transition: 'background 120ms ease'
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(238,241,243,0.6)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(group.id)}
                    onChange={() => toggleGroup(group.id)}
                    style={{
                      accentColor: 'var(--primary, #0052d0)',
                      width: 14,
                      height: 14,
                      flexShrink: 0,
                      cursor: 'pointer'
                    }}
                  />
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: group.color || 'var(--primary, #0052d0)',
                      flexShrink: 0
                    }}
                  />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group.name}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      }
    >
      <button
        type="button"
        className="ledger-inline-action-btn ledger-icon-only"
        title="管理分组"
      >
        <LedgerIcon name="groups" />
      </button>
    </Popover>
  )
}

export function WatchlistTable({
  items,
  removingAssetKey,
  selectedAssetKeys = [],
  groups,
  getAssetGroupIds,
  onToggleAssetGroup,
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
                className={`ledger-inline-action-btn ledger-icon-only ${selectedAssetKeys.includes(record.assetKey) ? 'is-selected' : ''}`}
                onClick={() => onToggleSelect?.(record.assetKey)}
                disabled={!onToggleSelect}
                title={selectedAssetKeys.includes(record.assetKey) ? '取消选择' : '选择对比'}
              >
                <LedgerIcon name="select" />
              </button>
            </div>
            <div className="ledger-data-actions">
              <AssetGroupPopover
                assetKey={record.assetKey}
                groups={groups}
                getAssetGroupIds={getAssetGroupIds}
                onToggle={(groupId, add) => onToggleAssetGroup(record.assetKey, groupId, add)}
              />
              <button
                type="button"
                className="ledger-inline-action-btn ledger-icon-only"
                onClick={() => onOpenDetail?.(record.assetKey)}
                disabled={!onOpenDetail}
                title="查看详情"
              >
                <LedgerIcon name="detail" />
              </button>
              <button
                type="button"
                className="ledger-inline-action-btn ledger-icon-only is-danger"
                onClick={() => onRemove?.(record.assetKey)}
                disabled={!onRemove || removingAssetKey === record.assetKey}
                title={removingAssetKey === record.assetKey ? '移除中...' : '移出自选'}
              >
                <LedgerIcon name="delete" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
