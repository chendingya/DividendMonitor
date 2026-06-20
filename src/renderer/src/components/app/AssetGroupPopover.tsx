import { Popover } from 'antd'
import { useState } from 'react'
import type { WatchlistGroupDto } from '@shared/contracts/api'
import { LedgerIcon } from '@renderer/components/app/LedgerUi'

export type AssetGroupPopoverProps = {
  assetKey: string
  groups: WatchlistGroupDto[]
  getAssetGroupIds: (assetKey: string) => Promise<string[]>
  onToggle: (groupId: string, add: boolean) => Promise<void>
}

export function AssetGroupPopover({ assetKey, groups, getAssetGroupIds, onToggle }: AssetGroupPopoverProps) {
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
