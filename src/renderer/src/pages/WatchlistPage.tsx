import { Alert, Col, Input, Row, Select, Skeleton, Space, message, Popconfirm } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { WatchlistTable } from '@renderer/components/watchlist/WatchlistTable'
import { useWatchlist } from '@renderer/hooks/useWatchlist'
import { useWatchlistGroups } from '@renderer/hooks/useWatchlistGroups'
import { LedgerIcon } from '@renderer/components/app/LedgerUi'
import { watchlistApi } from '@renderer/services/watchlistApi'
import {
  buildAssetDetailPath,
  buildComparisonPathFromAssetKeys,
  getRememberedWatchlistAssetSelections,
  rememberComparisonAssetKeys,
  rememberLastAssetKey,
  rememberWatchlistAssetSelections
} from '@renderer/services/routeContext'
import type { WatchlistEntryDto } from '@shared/contracts/api'

export function WatchlistPage() {
  const navigate = useNavigate()
  const [apiMessage, messageHolder] = message.useMessage()
  const [keyword, setKeyword] = useState('')
  const [sortBy, setSortBy] = useState<'yield-desc' | 'yield-asc' | 'symbol-asc' | 'price-desc'>('yield-desc')
  const [selectedAssetKeys, setSelectedAssetKeys] = useState<string[]>(() => getRememberedWatchlistAssetSelections())
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')

  const { data: allData, loading: watchlistLoading, error: watchlistError, reload, removeAsset, mutatingAssetKey } = useWatchlist()
  const {
    groups,
    loading: groupsLoading,
    createGroup,
    updateGroup,
    deleteGroup,
    addToGroup: toggleAddToGroup,
    removeFromGroup: toggleRemoveFromGroup
  } = useWatchlistGroups()

  const [groupData, setGroupData] = useState<WatchlistEntryDto[]>([])
  const [groupDataLoading, setGroupDataLoading] = useState(false)

  const activeGroup = useMemo(() => {
    if (!activeGroupId) return null
    return groups.find((g) => g.id === activeGroupId) ?? null
  }, [groups, activeGroupId])

  const loadGroupAssets = useCallback(async (groupId: string) => {
    setGroupDataLoading(true)
    try {
      const assets = await watchlistApi.listGroupAssets(groupId)
      setGroupData(assets)
    } catch {
      setGroupData([])
    } finally {
      setGroupDataLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeGroupId) {
      void loadGroupAssets(activeGroupId)
    }
  }, [activeGroupId, loadGroupAssets])

  const data = activeGroupId ? groupData : allData
  const loading = activeGroupId ? (groupDataLoading || watchlistLoading) : watchlistLoading
  const error = watchlistError

  const filteredData = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    const next = data.filter((item) => {
      if (!normalizedKeyword) return true
      return (item.symbol ?? item.code).toLowerCase().includes(normalizedKeyword) || item.name.toLowerCase().includes(normalizedKeyword)
    })

    next.sort((left, right) => {
      if (sortBy === 'symbol-asc') {
        return (left.symbol ?? left.code).localeCompare(right.symbol ?? right.code)
      }
      if (sortBy === 'price-desc') {
        return right.latestPrice - left.latestPrice
      }
      const leftYield = left.estimatedFutureYield ?? left.averageYield ?? (sortBy === 'yield-asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
      const rightYield = right.estimatedFutureYield ?? right.averageYield ?? (sortBy === 'yield-asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
      return sortBy === 'yield-asc' ? leftYield - rightYield : rightYield - leftYield
    })

    return next
  }, [data, keyword, sortBy])

  const topAssetKeys = useMemo(() => filteredData.slice(0, 3).map((item) => item.assetKey), [filteredData])
  const selectedAvailableAssetKeys = useMemo(
    () => selectedAssetKeys.filter((assetKey) => filteredData.some((item) => item.assetKey === assetKey)),
    [filteredData, selectedAssetKeys]
  )
  const avgYield = useMemo(() => {
    const values = filteredData.map((item) => item.estimatedFutureYield ?? item.averageYield).filter((item): item is number => item != null)
    if (values.length === 0) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }, [filteredData])
  const maxYieldItem = useMemo(() => {
    return [...filteredData]
      .filter((item) => item.estimatedFutureYield != null || item.averageYield != null)
      .sort((a, b) => (b.estimatedFutureYield ?? b.averageYield ?? 0) - (a.estimatedFutureYield ?? a.averageYield ?? 0))[0]
  }, [filteredData])

  useEffect(() => {
    setSelectedAssetKeys((current) => current.filter((assetKey) => data.some((item) => item.assetKey === assetKey)))
  }, [data])
  useEffect(() => {
    rememberWatchlistAssetSelections(selectedAssetKeys)
  }, [selectedAssetKeys])

  function goToBestYieldDetail() {
    if (!maxYieldItem) return
    rememberLastAssetKey(maxYieldItem.assetKey)
    navigate(buildAssetDetailPath(maxYieldItem.assetKey))
  }
  function goToDetail(assetKey: string) {
    rememberLastAssetKey(assetKey)
    navigate(buildAssetDetailPath(assetKey))
  }
  function goToComparison() {
    if (topAssetKeys.length === 0) return
    rememberComparisonAssetKeys(topAssetKeys)
    navigate(buildComparisonPathFromAssetKeys(topAssetKeys))
  }
  function toggleSelect(assetKey: string) {
    setSelectedAssetKeys((current) => {
      if (current.includes(assetKey)) return current.filter((item) => item !== assetKey)
      return [...current, assetKey].slice(0, 10)
    })
  }
  function selectTopThree() {
    setSelectedAssetKeys(filteredData.slice(0, 3).map((item) => item.assetKey))
  }
  function clearSelection() {
    setSelectedAssetKeys([])
  }
  function goToSelectedComparison() {
    if (selectedAvailableAssetKeys.length < 2) return
    rememberComparisonAssetKeys(selectedAvailableAssetKeys)
    navigate(buildComparisonPathFromAssetKeys(selectedAvailableAssetKeys))
  }
  async function removeFromWatchlist(assetKey: string) {
    try {
      await removeAsset(assetKey)
      apiMessage.success('已将该资产移出自选')
    } catch (actionError) {
      apiMessage.error(actionError instanceof Error ? actionError.message : '移除自选失败')
    }
  }
  async function refreshWatchlist() {
    try {
      await reload()
      if (activeGroupId) {
        await loadGroupAssets(activeGroupId)
      }
      apiMessage.success('自选列表已刷新')
    } catch (actionError) {
      apiMessage.error(actionError instanceof Error ? actionError.message : '刷新自选失败')
    }
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim()
    if (!name) return
    try {
      await createGroup({ name })
      setNewGroupName('')
      apiMessage.success('分组创建成功')
    } catch (actionError) {
      apiMessage.error(actionError instanceof Error ? actionError.message : '创建分组失败')
    }
  }

  function startEditGroup(groupId: string, currentName: string) {
    setEditingGroupId(groupId)
    setEditingGroupName(currentName)
  }

  async function handleUpdateGroup(id: string) {
    const name = editingGroupName.trim()
    if (!name) return
    try {
      await updateGroup(id, { name })
      setEditingGroupId(null)
      apiMessage.success('分组已重命名')
    } catch (actionError) {
      apiMessage.error(actionError instanceof Error ? actionError.message : '重命名失败')
    }
  }

  async function handleDeleteGroup(id: string) {
    try {
      await deleteGroup(id)
      if (activeGroupId === id) {
        setActiveGroupId(null)
      }
      apiMessage.success('分组已删除')
    } catch (actionError) {
      apiMessage.error(actionError instanceof Error ? actionError.message : '删除失败')
    }
  }

  const handleGetAssetGroupIds = useCallback(async (assetKey: string): Promise<string[]> => {
    try {
      return await watchlistApi.getAssetGroupIds(assetKey)
    } catch {
      return []
    }
  }, [])

  const handleToggleAssetGroup = useCallback(async (assetKey: string, groupId: string, add: boolean) => {
    try {
      if (add) {
        await toggleAddToGroup(groupId, assetKey)
      } else {
        await toggleRemoveFromGroup(groupId, assetKey)
      }
    } catch (actionError) {
      apiMessage.error(actionError instanceof Error ? actionError.message : (add ? '加入分组失败' : '移出分组失败'))
      throw actionError
    }
  }, [toggleAddToGroup, toggleRemoveFromGroup, apiMessage])

  function selectGroup(groupId: string | null) {
    setActiveGroupId(groupId)
    if (!groupId) {
      setGroupData([])
    }
  }

  const totalAssetCount = activeGroupId ? filteredData.length : allData.length

  if (loading && data.length === 0) {
    return <Skeleton active paragraph={{ rows: 6 }} />
  }

  if (error) {
    return <Alert type="error" message={error} />
  }

  return (
    <div className="ledger-page">
      {messageHolder}

      <section className="ledger-watchlist-header">
        <div className="ledger-watchlist-copy">
          <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>
            自选{activeGroup ? ` · ${activeGroup.name}` : ''}
          </h1>
          <p className="ledger-hero-subtitle">监控高收益机会与自定义关注清单。</p>
          <div className="ledger-watchlist-summary">
            <span className="pill primary">已追踪 {totalAssetCount} 只</span>
            <span className="pill">当前筛选 {filteredData.length} 只</span>
            <span className="pill">已选对比 {selectedAvailableAssetKeys.length} 只</span>
          </div>
        </div>
        <div className="ledger-hero-actions">
          <button type="button" className="ledger-secondary-button" onClick={goToBestYieldDetail} disabled={!maxYieldItem}>
            查看最高收益详情
          </button>
          <button
            type="button"
            className="ledger-primary-button"
            onClick={selectedAvailableAssetKeys.length >= 2 ? goToSelectedComparison : goToComparison}
            disabled={selectedAvailableAssetKeys.length < 2 && topAssetKeys.length < 2}
          >
            {selectedAvailableAssetKeys.length >= 2 ? `对比已选 ${selectedAvailableAssetKeys.length} 只` : '对比前 3 只'}
          </button>
        </div>
      </section>

      <section className="ledger-metric-grid">
        <div className="ledger-metric-panel is-primary">
          <div className="ledger-metric-label">平均收益率</div>
          <div className="ledger-metric-value">{avgYield == null ? '--' : `${(avgYield * 100).toFixed(2)}%`}</div>
          <div className="ledger-metric-hint">按可计算的股息率或历史分配收益率汇总</div>
        </div>
        <div className="ledger-metric-panel">
          <div className="ledger-metric-label">追踪资产数量</div>
          <div className="ledger-metric-value">{filteredData.length}</div>
          <div className="ledger-metric-hint">{keyword.trim() ? `共 ${totalAssetCount} 只，当前展示 ${filteredData.length} 只` : '来自本地自选与真实数据链路'}</div>
        </div>
        <div className="ledger-metric-panel">
          <div className="ledger-metric-label">最高收益率</div>
          <div className="ledger-metric-value">
            {maxYieldItem == null ? '--' : `${(((maxYieldItem.estimatedFutureYield ?? maxYieldItem.averageYield) ?? 0) * 100).toFixed(2)}%`}
          </div>
          <div className="ledger-metric-hint">{maxYieldItem ? `${maxYieldItem.symbol ?? maxYieldItem.code} ${maxYieldItem.name}` : '暂无可计算结果'}</div>
        </div>
      </section>

      <Row gutter={[20, 20]} align="top">
        <Col flex="260px">
          <section className="ledger-group-sidebar">
            <div className="ledger-group-sidebar-head">
              <div className="ledger-group-sidebar-title">
                <LedgerIcon name="groups" className="ledger-group-title-icon" />
                <span>分组</span>
              </div>
              <span className="ledger-group-sidebar-count">{groups.length} 个</span>
            </div>

            <div className="ledger-group-list">
              <button
                type="button"
                className={`ledger-group-item ${activeGroupId === null ? 'is-active' : ''}`}
                onClick={() => selectGroup(null)}
              >
                <span className="ledger-group-dot ledger-group-dot--all" />
                <span className="ledger-group-label">全部资产</span>
                <span className="ledger-group-count">{allData.length}</span>
              </button>

              {groupsLoading ? (
                <Skeleton active paragraph={{ rows: 2 }} title={false} />
              ) : (
                groups.map((group) => (
                  <div key={group.id} className="ledger-group-row">
                    {editingGroupId === group.id ? (
                      <Input
                        size="small"
                        className="ledger-group-edit-input"
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onPressEnter={() => handleUpdateGroup(group.id)}
                        onBlur={() => handleUpdateGroup(group.id)}
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        className={`ledger-group-item ${activeGroupId === group.id ? 'is-active' : ''}`}
                        onClick={() => selectGroup(group.id)}
                        onDoubleClick={() => startEditGroup(group.id, group.name)}
                      >
                        <span
                          className="ledger-group-dot"
                          style={{ background: group.color || undefined }}
                        />
                        <span className="ledger-group-label">{group.name}</span>
                        <span className="ledger-group-count">{group.assetCount}</span>
                      </button>
                    )}

                    {editingGroupId !== group.id && (
                      <div className="ledger-group-actions">
                        <button
                          type="button"
                          className="ledger-group-action-btn"
                          onClick={() => startEditGroup(group.id, group.name)}
                          title="重命名"
                        >
                          <svg viewBox="0 0 24 24" fill="none" width="13" height="13" aria-hidden="true">
                            <path d="M13 7l4 4M7 17l1-5 4-4 4 4-4 4-5 1z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M20 20H4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                        </button>
                        <Popconfirm
                          title="确认删除分组？"
                          description="分组内的资产不会被删除，仅移除分组本身。"
                          onConfirm={() => handleDeleteGroup(group.id)}
                          okText="删除"
                          cancelText="取消"
                        >
                          <button
                            type="button"
                            className="ledger-group-action-btn is-danger"
                            title="删除分组"
                          >
                            <svg viewBox="0 0 24 24" fill="none" width="13" height="13" aria-hidden="true">
                              <path d="M4 7h16M8 7V5.5A1.5 1.5 0 019.5 4h5A1.5 1.5 0 0116 5.5V7M6 7l1.5 12.5A1.5 1.5 0 008.9 21h6.2a1.5 1.5 0 001.4-1.5L18 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          </button>
                        </Popconfirm>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="ledger-group-add">
              <Input
                size="small"
                placeholder="新建分组"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onPressEnter={handleCreateGroup}
                className="ledger-group-add-input"
                suffix={
                  <button
                    type="button"
                    className="ledger-group-add-btn"
                    onClick={handleCreateGroup}
                    disabled={!newGroupName.trim()}
                  >
                    <LedgerIcon name="plus" />
                  </button>
                }
              />
            </div>
          </section>
        </Col>

        <Col flex="auto" style={{ minWidth: 0 }}>
          <section className="ledger-toolbar-card">
            <div className="ledger-toolbar-head">
              <div>
                <div className="ledger-toolbar-title">筛选与排序</div>
                <div className="ledger-toolbar-hint">先缩小范围，再决定要重点对比的标的。</div>
              </div>
            </div>
            <div className="ledger-filter-bar" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <Space wrap size={12}>
                <Input
                  allowClear
                  placeholder="筛选代码或名称"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  style={{ width: 240 }}
                />
                <Select
                  value={sortBy}
                  onChange={(value) => setSortBy(value)}
                  style={{ width: 200 }}
                  options={[
                    { value: 'yield-desc', label: '按收益率从高到低' },
                    { value: 'yield-asc', label: '按收益率从低到高' },
                    { value: 'price-desc', label: '按最新价从高到低' },
                    { value: 'symbol-asc', label: '按资产代码排序' }
                  ]}
                />
              </Space>
              <Space wrap size={12}>
                <button type="button" className="ledger-filter-chip" onClick={() => setKeyword('')}>
                  清空筛选
                </button>
                <button type="button" className="ledger-filter-chip" onClick={refreshWatchlist}>
                  刷新自选
                </button>
              </Space>
            </div>
            <div className="ledger-toolbar-divider" />
            <div className="ledger-filter-bar" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <Space wrap size={12}>
                <span className="pill primary">已选 {selectedAvailableAssetKeys.length} 只</span>
                <span className="ledger-selection-note">
                  {selectedAvailableAssetKeys.length >= 2
                    ? '已满足对比条件，可直接进入对比页。'
                    : '至少选择 2 只资产后，才能进入对比页。'}
                </span>
                <button type="button" className="ledger-filter-chip" onClick={selectTopThree} disabled={filteredData.length === 0}>
                  选中前 3 只
                </button>
                <button type="button" className="ledger-filter-chip" onClick={clearSelection} disabled={selectedAssetKeys.length === 0}>
                  清空选择
                </button>
              </Space>
              <Space wrap size={12}>
                <button
                  type="button"
                  className="ledger-primary-button"
                  onClick={goToSelectedComparison}
                  disabled={selectedAvailableAssetKeys.length < 2}
                >
                  批量进入对比
                </button>
              </Space>
            </div>
          </section>

          <div style={{ marginTop: 20 }}>
            <WatchlistTable
              items={filteredData}
              removingAssetKey={mutatingAssetKey}
              selectedAssetKeys={selectedAvailableAssetKeys}
              groups={groups}
              getAssetGroupIds={handleGetAssetGroupIds}
              onToggleAssetGroup={handleToggleAssetGroup}
              onOpenDetail={goToDetail}
              onRemove={removeFromWatchlist}
              onToggleSelect={toggleSelect}
            />
          </div>
        </Col>
      </Row>
    </div>
  )
}
