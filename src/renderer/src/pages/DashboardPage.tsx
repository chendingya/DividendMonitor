import { Col, Input, message, Modal, Popconfirm, Row } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PortfolioPositionEditorModal,
  type PortfolioEditorInitialValues,
  type PortfolioEditorMode,
  type PortfolioEditorSubmitValues
} from '@renderer/components/dashboard/PortfolioPositionEditorModal'
import { DashboardHero, DashboardSearchCard } from '@renderer/components/dashboard/DashboardHero'
import { DashboardMetricCards } from '@renderer/components/dashboard/DashboardMetricCards'
import { PortfolioTable } from '@renderer/components/dashboard/PortfolioTable'
import { DashboardOpportunities } from '@renderer/components/dashboard/DashboardOpportunities'
import { DashboardTools } from '@renderer/components/dashboard/DashboardTools'
import { usePortfolio, type PortfolioRow, type PortfolioTransaction } from '@renderer/hooks/usePortfolio'
import { usePortfolioRiskMetrics } from '@renderer/hooks/usePortfolioRiskMetrics'
import { CorrelationMatrix } from '@renderer/components/dashboard/CorrelationMatrix'
import { IndustryDistributionPie } from '@renderer/components/industry/IndustryDistributionPie'
import { PortfolioDistributionPie, type DistributionSlice } from '@renderer/components/dashboard/PortfolioDistributionPie'
import { useIndustryAnalysis } from '@renderer/hooks/useIndustryAnalysis'
import { assetApi } from '@renderer/services/assetApi'
import { useWatchlistGroups } from '@renderer/hooks/useWatchlistGroups'
import { watchlistApi } from '@renderer/services/watchlistApi'
import {
  buildAssetDetailPath,
  buildAssetSearchPath,
  buildBacktestPathFromAssetKey,
  buildComparisonPathFromAssetKeys,
  buildStockDetailPath,
  rememberLastAssetKey,
  rememberLastSymbol
} from '@renderer/services/routeContext'
import {
  removePortfolioPositionInBackend,
  removePortfolioPositionsByAssetInBackend,
  upsertPortfolioPositionInBackend
} from '@renderer/services/portfolioStore'

export function DashboardPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [apiMessage, messageHolder] = message.useMessage()
  const {
    groups,
    createGroup,
    updateGroup,
    deleteGroup,
    addToGroup,
    removeFromGroup
  } = useWatchlistGroups()
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [assetKeyToGroupIds, setAssetKeyToGroupIds] = useState<Map<string, string[]>>(new Map())
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroupInput, setShowNewGroupInput] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const {
    positions,
    rows,
    refreshing,
    totalCost,
    totalValue,
    totalReturn,
    avgYieldMetric,
    opportunities,
    recentItems,
    refreshQuotes,
    reload
  } = usePortfolio()
  const initialRefreshDoneRef = useRef(false)
  useEffect(() => {
    if (!refreshing && !initialRefreshDoneRef.current && rows.length > 0) {
      initialRefreshDoneRef.current = true
      setRefreshedAt(new Date())
    }
  }, [refreshing, rows.length])
  const { data: riskMetrics } = usePortfolioRiskMetrics(rows)
  const { distribution } = useIndustryAnalysis()

  const positionAssetKeySignature = useMemo(
    () => positions.map((p) => p.assetKey ?? '').filter(Boolean).join(','),
    [positions]
  )

  useEffect(() => {
    if (positions.length === 0) {
      setAssetKeyToGroupIds(new Map())
      return
    }
    let disposed = false
    void Promise.allSettled(
      positions.map((p) => {
        const assetKey = p.assetKey
        if (!assetKey) return Promise.reject(new Error('no assetKey'))
        return watchlistApi.getAssetGroupIds(assetKey).then((ids) => [assetKey, ids] as const)
      })
    ).then((results) => {
      if (disposed) return
      const next = new Map<string, string[]>()
      results.forEach((r) => {
        if (r.status === 'fulfilled') {
          next.set(r.value[0], r.value[1])
        }
      })
      setAssetKeyToGroupIds(next)
    })
    return () => {
      disposed = true
    }
  }, [positionAssetKeySignature])

  useEffect(() => {
    if (activeGroupId && !groups.some((g) => g.id === activeGroupId)) {
      setActiveGroupId(null)
    }
  }, [groups, activeGroupId])

  const filteredRows = useMemo(() => {
    if (!activeGroupId) return rows
    return rows.filter((row) => assetKeyToGroupIds.get(row.assetKey ?? '')?.includes(activeGroupId))
  }, [rows, activeGroupId, assetKeyToGroupIds])

  const riskDistribution = useMemo<DistributionSlice[]>(() => {
    const buckets = new Map<string, number>([
      ['低风险', 0],
      ['中风险', 0],
      ['高风险', 0],
      ['未指定', 0]
    ])
    const colorMap: Record<string, string> = {
      低风险: '#16a34a',
      中风险: '#ea580c',
      高风险: '#dc2626',
      未指定: '#94a3b8'
    }
    for (const row of rows) {
      const mv = row.marketValue
      if (!mv || mv <= 0) continue
      const level = row.riskLevel
      const label = level === 'LOW' ? '低风险' : level === 'MEDIUM' ? '中风险' : level === 'HIGH' ? '高风险' : '未指定'
      buckets.set(label, (buckets.get(label) ?? 0) + mv)
    }
    return [...buckets.entries()]
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: colorMap[name] }))
  }, [rows])

  const groupDistribution = useMemo<DistributionSlice[]>(() => {
    if (groups.length === 0 && rows.length === 0) return []
    const groupValues = new Map<string, number>()
    let orphanValue = 0
    for (const row of rows) {
      const mv = row.marketValue
      if (!mv || mv <= 0) continue
      const assetKey = row.assetKey ?? ''
      const ids = assetKey ? assetKeyToGroupIds.get(assetKey) ?? [] : []
      if (ids.length === 0) {
        orphanValue += mv
        continue
      }
      const share = mv / ids.length
      for (const gid of ids) {
        groupValues.set(gid, (groupValues.get(gid) ?? 0) + share)
      }
    }
    const items: DistributionSlice[] = groups
      .map((g) => ({
        name: g.name,
        value: Math.round(groupValues.get(g.id) ?? 0),
        color: g.color
      }))
      .filter((i) => i.value > 0)
    if (orphanValue > 0) {
      items.push({ name: '未分组', value: Math.round(orphanValue), color: '#94a3b8' })
    }
    return items
  }, [rows, groups, assetKeyToGroupIds])

  const handleGetAssetGroupIds = useCallback(async (assetKey: string): Promise<string[]> => {
    try {
      return await watchlistApi.getAssetGroupIds(assetKey)
    } catch {
      return []
    }
  }, [])

  const handleToggleAssetGroup = useCallback(
    async (assetKey: string, groupId: string, add: boolean) => {
      try {
        if (add) {
          await addToGroup(groupId, assetKey)
        } else {
          await removeFromGroup(groupId, assetKey)
        }
        const ids = await watchlistApi.getAssetGroupIds(assetKey)
        setAssetKeyToGroupIds((prev) => {
          const next = new Map(prev)
          next.set(assetKey, ids)
          return next
        })
      } catch (err) {
        apiMessage.error(err instanceof Error ? err.message : '分组操作失败')
        throw err
      }
    },
    [addToGroup, removeFromGroup, apiMessage]
  )

  async function handleCreateGroup() {
    const name = newGroupName.trim()
    if (!name) return
    try {
      await createGroup({ name })
      setNewGroupName('')
      setShowNewGroupInput(false)
      apiMessage.success('分组创建成功')
    } catch (err) {
      apiMessage.error(err instanceof Error ? err.message : '创建分组失败')
    }
  }

  function handleStartEditGroup(groupId: string, currentName: string) {
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
    } catch (err) {
      apiMessage.error(err instanceof Error ? err.message : '重命名失败')
    }
  }

  async function handleDeleteGroup(id: string) {
    try {
      await deleteGroup(id)
      if (activeGroupId === id) {
        setActiveGroupId(null)
      }
      apiMessage.success('分组已删除')
    } catch (err) {
      apiMessage.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  const [searchKeyword, setSearchKeyword] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<PortfolioEditorMode>('create')
  const [editingRow, setEditingRow] = useState<PortfolioRow | null>(null)
  const [editorInitialValues, setEditorInitialValues] = useState<PortfolioEditorInitialValues>({
    symbol: '',
    name: '',
    direction: 'BUY',
    shares: 100,
    avgCost: 10
  })

  function goToDetail(record: { assetKey?: string; symbol?: string }) {
    if (record.assetKey) {
      rememberLastAssetKey(record.assetKey)
      navigate(buildAssetDetailPath(record.assetKey))
      return
    }
    if (record.symbol) {
      rememberLastSymbol(record.symbol)
      navigate(buildStockDetailPath(record.symbol))
    }
  }

  function openAssetSearch() {
    const keyword = searchKeyword.trim()
    if (!keyword) return
    navigate(buildAssetSearchPath(keyword))
  }

  function openCreate() {
    setEditorMode('create')
    setEditingRow(null)
    setEditorInitialValues({
      assetKey: '',
      assetType: undefined,
      market: 'A_SHARE',
      code: '',
      symbol: '',
      name: '',
      direction: 'BUY',
      shares: 100,
      avgCost: 10
    })
    setEditorOpen(true)
  }

  function openEdit(record: PortfolioRow) {
    setEditorMode('edit')
    setEditingRow(record)
    setEditorInitialValues({
      assetKey: record.assetKey,
      assetType: record.assetType,
      market: record.market,
      code: record.code,
      symbol: record.symbol ?? '',
      name: record.name,
      direction: 'BUY',
      shares: record.netShares,
      avgCost: record.tradePrice ?? record.avgCost,
      openedAt: record.openedAt,
      riskLevel: record.riskLevel
    })
    setEditorOpen(true)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditingRow(null)
    setEditorMode('create')
  }

  async function onSubmitEditor(values: PortfolioEditorSubmitValues) {
    if (editorMode === 'edit') {
      if (!editingRow) {
        apiMessage.error('未找到待编辑持仓')
        return
      }
      await upsertPortfolioPositionInBackend({
        id: editingRow.id,
        assetKey: values.assetKey || editingRow.assetKey,
        assetType: values.assetType ?? editingRow.assetType,
        market: values.market ?? editingRow.market,
        code: values.code ?? editingRow.code,
        symbol: values.symbol ?? editingRow.symbol,
        name: values.name?.trim() || editingRow.name || '未命名标的',
        direction: values.direction ?? editingRow.direction ?? 'BUY',
        shares: values.shares,
        avgCost: values.avgCost,
        tradePrice: values.tradePrice,
        riskLevel: values.riskLevel ?? editingRow.riskLevel,
        openedAt: values.openedAt
      })
      await reload()
      closeEditor()
      apiMessage.success('持仓已更新')
      return
    }

    await upsertPortfolioPositionInBackend({
      id: '',
      assetKey: values.assetKey,
      assetType: values.assetType,
      market: values.market,
      code: values.code,
      symbol: values.symbol,
      name: values.name,
      direction: values.direction,
      shares: values.shares,
      avgCost: values.avgCost,
      tradePrice: values.tradePrice,
      openedAt: values.openedAt,
      riskLevel: values.riskLevel
    })
    await reload()
    closeEditor()
    apiMessage.success('资产已添加')
  }

  async function onRemove(id: string) {
    await removePortfolioPositionInBackend(id)
    await reload()
    apiMessage.success('已移除持仓')
  }

  function openSecondConfirm(options: { content: string; onConfirm: () => void }) {
    Modal.confirm({
      title: '最终确认',
      content: `${options.content}（此操作不可恢复）`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: options.onConfirm
    })
  }

  function onRemoveRow(record: PortfolioRow) {
    if (record.symbol) {
      Modal.confirm({
        title: '确认删除该标的？',
        content: `将删除 ${record.symbol}（${record.name}）的全部交易记录。`,
        okText: '下一步',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () =>
          openSecondConfirm({
            content: `确认删除 ${record.symbol}（${record.name}）的全部交易记录`,
            onConfirm: async () => {
              await removePortfolioPositionsByAssetInBackend(record.assetKey ?? record.symbol!)
              await reload()
              apiMessage.success(`已删除 ${record.symbol} 的全部交易记录`)
            }
          })
      })
      return
    }
    Modal.confirm({
      title: '确认删除该资产？',
      content: `将删除 ${record.name} 的当前资产记录。`,
      okText: '下一步',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () =>
        openSecondConfirm({
          content: `确认删除 ${record.name} 的当前资产记录`,
          onConfirm: () => onRemove(record.id)
        })
    })
  }

  function onEditTransaction(record: PortfolioRow, transaction: PortfolioTransaction) {
    setEditorMode('edit')
    setEditingRow({ ...record, id: transaction.id })
    setEditorInitialValues({
      assetKey: record.assetKey,
      assetType: record.assetType,
      market: record.market,
      code: record.code,
      symbol: record.symbol ?? '',
      name: record.name,
      direction: transaction.direction,
      shares: transaction.shares,
      avgCost: transaction.tradePrice ?? transaction.avgCost,
      openedAt: transaction.openedAt,
      riskLevel: record.riskLevel
    })
    setEditorOpen(true)
  }

  function onRemoveTransaction(record: PortfolioRow, transaction: PortfolioTransaction) {
    Modal.confirm({
      title: '确认删除此笔交易？',
      content: `将删除 ${record.name} 的一笔${transaction.direction === 'BUY' ? '买入' : '卖出'}记录（${transaction.shares.toFixed(2)} 股 @ ${transaction.avgCost.toFixed(4)}）。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await removePortfolioPositionInBackend(transaction.id)
        await reload()
        apiMessage.success('已删除该笔交易')
      }
    })
  }

  async function onRefresh() {
    const result = await refreshQuotes()
    setRefreshedAt(new Date())
    if (result && result.failed > 0) {
      apiMessage.warning(`有 ${result.failed} 个标的刷新失败，请稍后重试`)
    } else {
      apiMessage.success('估值已更新')
    }
  }

  function exportReport() {
    if (rows.length === 0) return
    const header = [
      '资产类型', '代码', '名称', '股数', '成本价', '最新价',
      '持仓成本', '持仓市值', '持仓收益率', '收益指标', '收益口径'
    ]
    const lines = rows.map((row) => {
      const costValue = row.avgCost * row.shares
      return [
        row.assetType ?? '',
        row.symbol ?? row.code ?? '',
        row.name,
        row.shares.toFixed(4),
        row.avgCost.toFixed(4),
        row.latestPrice?.toFixed(4) ?? '',
        costValue.toFixed(4),
        row.marketValue?.toFixed(4) ?? '',
        row.positionReturn == null ? '' : row.positionReturn.toFixed(6),
        row.yieldMetric == null ? '' : row.yieldMetric.toFixed(6),
        row.yieldLabel ?? ''
      ].join(',')
    })

    const summaryRows: string[] = []
    summaryRows.push('')
    summaryRows.push('--- 组合风险指标 ---')
    summaryRows.push(`组合总收益率,${totalReturn.toFixed(6)}`)
    summaryRows.push(`总成本,${totalCost.toFixed(2)}`)
    summaryRows.push(`总市值,${totalValue.toFixed(2)}`)
    summaryRows.push(`加权平均收益指标,${avgYieldMetric != null ? avgYieldMetric.toFixed(6) : '--'}`)

    if (riskMetrics) {
      summaryRows.push(`组合年化波动率,${riskMetrics.portfolioVolatility != null ? riskMetrics.portfolioVolatility.toFixed(6) : '--'}`)
      summaryRows.push(`组合夏普比率,${riskMetrics.portfolioSharpeRatio != null ? riskMetrics.portfolioSharpeRatio.toFixed(4) : '--'}`)
      summaryRows.push(`最大回撤,${riskMetrics.maxDrawdown != null ? riskMetrics.maxDrawdown.toFixed(6) : '--'}`)
      if (riskMetrics.commonDateRange) {
        summaryRows.push(`计算周期,${riskMetrics.commonDateRange.start} 至 ${riskMetrics.commonDateRange.end}`)
        summaryRows.push(`共同交易日,${riskMetrics.commonDateRange.tradingDays} 天`)
      }
      if (riskMetrics.correlationMatrix) {
        summaryRows.push('')
        summaryRows.push('--- 持仓相关性矩阵 ---')
        const { assetKeys, matrix } = riskMetrics.correlationMatrix
        summaryRows.push(`资产,${assetKeys.join(',')}`)
        matrix.forEach((row, idx) => {
          summaryRows.push(`${assetKeys[idx]},${row.map((v) => v.toFixed(4)).join(',')}`)
        })
      }
    }

    const csv = [header.join(','), ...lines, ...summaryRows].join('\n')
    const bom = new Uint8Array([0xef, 0xbb, 0xbf])
    const content = new TextEncoder().encode(csv)
    const blob = new Blob([bom, content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `portfolio-report-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function exportPositions() {
    if (positions.length === 0) return
    const data = positions.map((p) => ({
      assetType: p.assetType,
      code: p.code,
      symbol: p.symbol,
      name: p.name,
      direction: p.direction ?? 'BUY',
      shares: p.shares,
      avgCost: p.avgCost
    }))
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([new TextEncoder().encode(json)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `portfolio-positions-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importPositions(file: File) {
    try {
      const text = await file.text()
      const data = JSON.parse(text) as Array<{
        assetType?: string; code?: string; symbol?: string
        name: string; direction?: string; shares: number; avgCost: number
      }>
      if (!Array.isArray(data) || data.length === 0) {
        apiMessage.error('文件格式无效或没有持仓数据')
        return
      }
      let imported = 0
      for (const item of data) {
        if (!item.name || item.shares == null || item.avgCost == null) continue
        const direction = (item.direction === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL'
        const assetType = (item.assetType ?? 'STOCK') as 'STOCK' | 'ETF' | 'FUND' | 'GOLD' | 'SILVER'
        const code = item.code ?? item.symbol ?? ''
        const symbol = item.symbol ?? code
        const assetKey =
          item.symbol ? `STOCK:A_SHARE:${item.symbol}` :
          assetType === 'GOLD' || assetType === 'SILVER' ? `${assetType}:SGE:${code}` :
          assetType !== 'STOCK' ? `${assetType}:A_SHARE:${code}` : undefined

        await upsertPortfolioPositionInBackend({
          id: crypto.randomUUID(),
          assetKey,
          assetType,
          code,
          symbol,
          name: item.name,
          direction,
          shares: Math.abs(item.shares),
          avgCost: Math.abs(item.avgCost)
        })
        imported++
      }
      apiMessage.success(`成功导入 ${imported} 条持仓记录`)
      await reload()
    } catch (err) {
      apiMessage.error(err instanceof Error ? err.message : '导入失败，请检查文件格式')
    }
  }

  function triggerImport() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      void importPositions(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="ledger-page">
      {messageHolder}

      <DashboardHero
        rows={rows}
        positions={positions}
        refreshing={refreshing}
        refreshedAt={refreshedAt}
        onSearch={openAssetSearch}
        onRefresh={onRefresh}
        onExportReport={exportReport}
        onExportPositions={exportPositions}
        onImport={triggerImport}
        onAdd={openCreate}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <DashboardMetricCards
        totalReturn={totalReturn}
        totalCost={totalCost}
        totalValue={totalValue}
        avgYieldMetric={avgYieldMetric}
        rowCount={rows.length}
        riskMetrics={riskMetrics}
      />

      <DashboardSearchCard
        searchKeyword={searchKeyword}
        onSearchKeywordChange={setSearchKeyword}
        onSearch={openAssetSearch}
      />

      <div
        className="ledger-portfolio-group-tabs"
        style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <button
          type="button"
          className={`ledger-inline-action-btn ${activeGroupId === null ? 'is-selected' : ''}`}
          onClick={() => setActiveGroupId(null)}
        >
          全部
        </button>
        {groups.map((g) => (
          <div key={g.id} className="ledger-group-row">
            {editingGroupId === g.id ? (
              <Input
                size="small"
                className="ledger-group-edit-input"
                placeholder="分组名称"
                value={editingGroupName}
                onChange={(e) => setEditingGroupName(e.target.value)}
                onPressEnter={() => handleUpdateGroup(g.id)}
                onBlur={() => handleUpdateGroup(g.id)}
                style={{ width: 120 }}
                autoFocus
              />
            ) : (
              <button
                type="button"
                className={`ledger-inline-action-btn ${activeGroupId === g.id ? 'is-selected' : ''}`}
                onClick={() => setActiveGroupId(g.id)}
              >
                {g.color && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: g.color,
                      marginRight: 6,
                      verticalAlign: 'middle'
                    }}
                  />
                )}
                {g.name}
              </button>
            )}

            {editingGroupId !== g.id && (
              <div className="ledger-group-actions">
                <button
                  type="button"
                  className="ledger-group-action-btn"
                  onClick={() => handleStartEditGroup(g.id, g.name)}
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
                  onConfirm={() => handleDeleteGroup(g.id)}
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
        ))}
        {showNewGroupInput ? (
          <Input
            size="small"
            placeholder="分组名称"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onPressEnter={handleCreateGroup}
            onBlur={() => {
              setShowNewGroupInput(false)
              setNewGroupName('')
            }}
            style={{ width: 120 }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="ledger-inline-action-btn"
            onClick={() => setShowNewGroupInput(true)}
          >
            + 新建分组
          </button>
        )}
      </div>

      <PortfolioTable
        rows={filteredRows}
        groups={groups}
        getAssetGroupIds={handleGetAssetGroupIds}
        onToggleAssetGroup={handleToggleAssetGroup}
        onGoToDetail={(row) => goToDetail(row)}
        onEdit={openEdit}
        onRemove={onRemoveRow}
        onEditTransaction={onEditTransaction}
        onRemoveTransaction={onRemoveTransaction}
      />

      <DashboardOpportunities
        opportunities={opportunities}
        onGoToDetail={(row) => goToDetail(row)}
      />

      <CorrelationMatrix
        data={riskMetrics?.correlationMatrix}
        dateRange={riskMetrics?.commonDateRange}
      />

      {((distribution && distribution.length > 0) || riskDistribution.length > 0 || groupDistribution.length > 0) && (
        <div className="page-section">
          <div className="ledger-section-head">
            <h2>持仓结构分布</h2>
          </div>
          <Row gutter={[16, 16]}>
            {distribution && distribution.length > 0 && (
              <Col xs={24} md={12} xl={8}>
                <div className="ledger-toolbar-card">
                  <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#475569' }}>按行业</h3>
                  <IndustryDistributionPie distribution={distribution} />
                </div>
              </Col>
            )}
            {riskDistribution.length > 0 && (
              <Col xs={24} md={12} xl={8}>
                <div className="ledger-toolbar-card">
                  <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#475569' }}>按风险等级</h3>
                  <PortfolioDistributionPie items={riskDistribution} />
                </div>
              </Col>
            )}
            {groupDistribution.length > 0 && (
              <Col xs={24} md={12} xl={8}>
                <div className="ledger-toolbar-card">
                  <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#475569' }}>按自定义分组</h3>
                  <PortfolioDistributionPie items={groupDistribution} />
                </div>
              </Col>
            )}
          </Row>
        </div>
      )}

      <DashboardTools
        recentItems={recentItems}
        rows={rows}
        onGoToDetail={(row) => goToDetail(row)}
        onNavigateToBacktest={() => {
          const first = rows.find((item) => item.assetKey)?.assetKey
          if (first) navigate(buildBacktestPathFromAssetKey(first))
        }}
        onNavigateToComparison={() => {
          const assetKeys = rows
            .map((item) => item.assetKey)
            .filter((item): item is string => Boolean(item))
            .slice(0, 3)
          if (assetKeys.length >= 2) navigate(buildComparisonPathFromAssetKeys(assetKeys))
        }}
      />

      <PortfolioPositionEditorModal
        open={editorOpen}
        mode={editorMode}
        initialValues={editorInitialValues}
        onCancel={closeEditor}
        onSubmit={onSubmitEditor}
        assetApi={assetApi}
      />
    </div>
  )
}
