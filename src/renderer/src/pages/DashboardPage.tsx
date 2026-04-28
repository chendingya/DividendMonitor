import { Button, Input, message, Modal, Space, Table, Tag, Typography } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssetDetailDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'
import {
  PortfolioPositionEditorModal,
  type PortfolioEditorInitialValues,
  type PortfolioEditorMode,
  type PortfolioEditorSubmitValues
} from '@renderer/components/dashboard/PortfolioPositionEditorModal'
import { AssetAvatar } from '@renderer/components/app/AssetAvatar'
import { MetricPanel, OpportunityCard, RecentItem, ToolCard } from '@renderer/components/app/LedgerUi'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import { getYieldSnapshot } from '@renderer/pages/dashboardMetrics'
import { useNavigate } from 'react-router-dom'
import { assetApi } from '@renderer/services/assetApi'
import {
  buildAssetDetailPath,
  buildAssetSearchPath,
  buildBacktestPathFromAssetKey,
  buildComparisonPathFromAssetKeys,
  buildStockDetailPath,
  getRecentAssetKeys,
  rememberLastAssetKey,
  rememberLastSymbol
} from '@renderer/services/routeContext'
import {
  listPortfolioPositionsFromBackend,
  removePortfolioPositionInBackend,
  removePortfolioPositionsByAssetInBackend,
  replacePortfolioPositionsByAssetInBackend,
  type PortfolioPosition,
  upsertPortfolioPositionInBackend
} from '@renderer/services/portfolioStore'

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

type PortfolioRow = PortfolioPosition & {
  latestPrice?: number
  marketValue?: number
  yieldMetric?: number
  yieldLabel?: string
  positionReturn?: number
  netShares: number
  transactionCount: number
  netCostAmount: number
}

type PortfolioOpportunity = PortfolioRow & {
  displayCode: string
  yieldMetric: number
  yieldLabel: string
}

export function DashboardPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [apiMessage, messageHolder] = message.useMessage()
  const [positions, setPositions] = useState<PortfolioPosition[]>([])
  const [details, setDetails] = useState<Record<string, AssetDetailDto>>({})
  const [refreshing, setRefreshing] = useState(false)
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

  const recentAssetKeys = useMemo(() => getRecentAssetKeys(), [])

  useEffect(() => {
    let disposed = false
    void listPortfolioPositionsFromBackend()
      .then((items) => {
        if (!disposed) {
          setPositions(items)
        }
      })
      .catch((error) => {
        if (!disposed) {
          apiMessage.error(error instanceof Error ? error.message : '加载持仓失败')
        }
      })

    return () => {
      disposed = true
    }
  }, [apiMessage])

  const rows = useMemo<PortfolioRow[]>(() => {
    const byKey = new Map<string, PortfolioRow>()

    for (const position of positions) {
      const direction = position.direction === 'SELL' ? 'SELL' : 'BUY'
      const signedShares = direction === 'SELL' ? -Math.abs(position.shares) : Math.abs(position.shares)
      const key = position.assetKey ? `asset:${position.assetKey}` : position.symbol ? `symbol:${position.symbol}` : `item:${position.id}`
      const current = byKey.get(key)

      if (!current) {
        byKey.set(key, {
          ...position,
          direction: 'BUY',
          shares: Math.abs(position.shares),
          netShares: signedShares,
          transactionCount: 1,
          netCostAmount: signedShares * position.avgCost,
          latestPrice: undefined,
          marketValue: undefined,
          yieldMetric: undefined,
          yieldLabel: undefined,
          positionReturn: undefined
        })
        continue
      }

      current.netShares += signedShares
      current.netCostAmount += signedShares * position.avgCost
      current.transactionCount += 1
      current.updatedAt = position.updatedAt > current.updatedAt ? position.updatedAt : current.updatedAt
    }

    const merged = [...byKey.values()].map((row) => {
      const detailKey = row.assetKey ?? row.symbol ?? row.id
      const detail = details[detailKey]
      const latestPrice = detail?.latestPrice
      const normalizedNetShares = Math.max(0, row.netShares)
      const marketValue = latestPrice == null ? undefined : latestPrice * normalizedNetShares
      const avgCost = normalizedNetShares > 0 ? row.netCostAmount / normalizedNetShares : row.avgCost
      const costValue = avgCost > 0 ? avgCost * normalizedNetShares : 0
      const positionReturn = marketValue == null || costValue <= 0 ? undefined : marketValue / costValue - 1
      const yieldSnapshot = getYieldSnapshot(detail)

      return {
        ...row,
        shares: normalizedNetShares,
        netShares: normalizedNetShares,
        avgCost: avgCost > 0 ? avgCost : row.avgCost,
        latestPrice,
        marketValue: normalizedNetShares > 0 ? marketValue : 0,
        yieldMetric: normalizedNetShares > 0 ? yieldSnapshot.value : undefined,
        yieldLabel: yieldSnapshot.label,
        positionReturn
      }
    })

    return merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [details, positions])

  const totalCost = useMemo(() => rows.reduce((sum, item) => sum + item.avgCost * item.shares, 0), [rows])
  const totalValue = useMemo(() => rows.reduce((sum, item) => sum + (item.marketValue ?? 0), 0), [rows])
  const totalReturn = useMemo(() => (totalCost <= 0 ? 0 : totalValue / totalCost - 1), [totalCost, totalValue])
  const avgYieldMetric = useMemo(() => {
    const available = rows.filter((row) => row.yieldMetric != null)
    if (available.length === 0) {
      return undefined
    }
    const weighted = available
      .map((item) => {
        const weight = item.marketValue ?? item.avgCost * item.shares
        return {
          weight,
          yield: item.yieldMetric ?? 0
        }
      })
      .filter((item) => item.weight > 0)

    if (weighted.length === 0) {
      return undefined
    }

    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0)
    const weightedYield = weighted.reduce((sum, item) => sum + item.yield * item.weight, 0)
    return weightedYield / totalWeight
  }, [rows])

  const opportunities = useMemo<PortfolioOpportunity[]>(() => {
    return [...rows]
      .map((row) => ({
        ...row,
        displayCode: row.symbol ?? row.code ?? row.assetKey ?? row.id
      }))
      .filter((row): row is PortfolioOpportunity => row.yieldMetric != null && row.yieldLabel != null)
      .sort((a, b) => (b.yieldMetric ?? 0) - (a.yieldMetric ?? 0))
      .slice(0, 4)
  }, [rows])

  const recentItems = useMemo(() => {
    return recentAssetKeys.slice(0, 5).map((assetKey) => {
      const detail = details[assetKey]
      return {
        assetKey,
        assetType: detail?.assetType,
        symbol: detail?.symbol ?? detail?.code ?? assetKey,
        title: detail?.name ?? assetKey,
        subtitle: `${detail?.symbol ?? detail?.code ?? assetKey} · ${detail?.assetType ?? '最近浏览'}`
      }
    })
  }, [details, recentAssetKeys])

  useEffect(() => {
    if (positions.length === 0) {
      setDetails({})
      return
    }
    let disposed = false
    setRefreshing(true)
    const assetKeys = positions
      .map((position) => position.assetKey)
      .filter((item): item is string => Boolean(item))
    void Promise.allSettled(assetKeys.map((assetKey) => assetApi.getDetail({ assetKey }))).then((results) => {
      if (disposed) {
        return
      }
      const next: Record<string, AssetDetailDto> = {}
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          next[result.value.assetKey] = result.value
        }
      })
      setDetails(next)
      setRefreshing(false)
    })
    return () => {
      disposed = true
    }
  }, [positions])

  function goToDetail(record: Pick<PortfolioPosition, 'assetKey' | 'symbol'>) {
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
      avgCost: record.avgCost
    })
    setEditorOpen(true)
  }

  function openAssetSearch() {
    const keyword = searchKeyword.trim()
    if (!keyword) {
      return
    }
    navigate(buildAssetSearchPath(keyword))
  }

  async function refreshQuotes() {
    if (positions.length === 0) {
      return
    }
    setRefreshing(true)
    const assetKeys = positions
      .map((position) => position.assetKey)
      .filter((item): item is string => Boolean(item))
    const results = await Promise.allSettled(assetKeys.map((assetKey) => assetApi.getDetail({ assetKey })))
    const next: Record<string, AssetDetailDto> = {}
    let failed = 0
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        next[result.value.assetKey] = result.value
      } else {
        failed += 1
      }
    })
    setDetails(next)
    setRefreshing(false)
    if (failed > 0) {
      apiMessage.warning(`有 ${failed} 个标的刷新失败，请稍后重试`)
    } else {
      apiMessage.success('估值已更新')
    }
  }

  function exportReport() {
    if (rows.length === 0) {
      return
    }
    const header = ['资产类型', '代码', '名称', '股数', '成本价', '最新价', '持仓成本', '持仓市值', '持仓收益率', '收益指标', '收益口径']
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
    const csv = [header.join(','), ...lines].join('\n')
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
    const content = new TextEncoder().encode(json)
    const blob = new Blob([content], { type: 'application/json' })
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
        assetType?: string
        code?: string
        symbol?: string
        name: string
        direction?: string
        shares: number
        avgCost: number
      }>

      if (!Array.isArray(data) || data.length === 0) {
        apiMessage.error('文件格式无效或没有持仓数据')
        return
      }

      let imported = 0
      for (const item of data) {
        if (!item.name || item.shares == null || item.avgCost == null) continue
        const direction = (item.direction === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL'
        const assetType = (item.assetType ?? 'STOCK') as 'STOCK' | 'ETF' | 'FUND'
        const code = item.code ?? item.symbol ?? ''
        const symbol = item.symbol ?? code
        let assetKey = item.symbol
          ? `STOCK:A_SHARE:${item.symbol}`
          : assetType !== 'STOCK'
            ? `${assetType}:A_SHARE:${code}`
            : undefined

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
      const reloaded = await listPortfolioPositionsFromBackend()
      setPositions(reloaded)
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
    // Reset so the same file can be re-imported
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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
      if (editingRow.symbol) {
        await replacePortfolioPositionsByAssetInBackend(editingRow.assetKey ?? editingRow.symbol, {
          name: editingRow.name,
          shares: values.shares,
          avgCost: values.avgCost
        })
        setPositions(await listPortfolioPositionsFromBackend())
        closeEditor()
        apiMessage.success('持仓已更新（按当前汇总覆盖）')
        return
      }
      await upsertPortfolioPositionInBackend({
        id: editingRow.id,
        assetKey: editingRow.assetKey,
        assetType: editingRow.assetType,
        market: editingRow.market,
        code: editingRow.code,
        symbol: editingRow.symbol,
        name: values.name?.trim() || editingRow.name || '未命名标的',
        direction: 'BUY',
        shares: values.shares,
        avgCost: values.avgCost
      })
      setPositions(await listPortfolioPositionsFromBackend())
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
      avgCost: values.avgCost
    })
    setPositions(await listPortfolioPositionsFromBackend())
    closeEditor()
    apiMessage.success('资产已添加')
  }

  async function onRemove(id: string) {
    await removePortfolioPositionInBackend(id)
    setPositions(await listPortfolioPositionsFromBackend())
    apiMessage.success('已移除持仓')
  }

  function openSecondConfirm(options: {
    content: string
    onConfirm: () => void
  }) {
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
              setPositions(await listPortfolioPositionsFromBackend())
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

  return (
    <div className="ledger-page">
      {messageHolder}
      <section className="ledger-hero-card">
        <div className="ledger-hero-copy">
          <div>
            <div className="ledger-section-kicker">投资组合</div>
            <h1 className="ledger-hero-title">工作台</h1>
            <p className="ledger-hero-subtitle">
              实时数据查看估值、收益率和未来股息率
            </p>
          </div>
          <div className="ledger-hero-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              className="ledger-secondary-button"
              disabled={rows.length === 0}
              onClick={exportReport}
              style={{ background: '#f0f2f5', borderColor: '#d9dde1', color: '#4e5969' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              导出报告
            </button>
            <button
              type="button"
              className="ledger-secondary-button"
              disabled={positions.length === 0}
              onClick={exportPositions}
              style={{ background: '#e8f4fd', borderColor: '#b3d8f0', color: '#1677ff' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              导出持仓
            </button>
            <button
              type="button"
              className="ledger-secondary-button"
              onClick={triggerImport}
              style={{ background: '#e6f7ec', borderColor: '#a3d9b1', color: '#00a854' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              导入持仓
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="ledger-secondary-button"
              disabled={rows.length === 0}
              onClick={refreshQuotes}
              style={{ background: '#fff7e6', borderColor: '#ffd591', color: '#d46b08' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {refreshing ? '刷新中...' : '刷新估值'}
            </button>
            <button
              type="button"
              className="ledger-secondary-button"
              onClick={() => navigate(buildAssetSearchPath(searchKeyword))}
              style={{ background: '#f0f5ff', borderColor: '#adc6ff', color: '#2f54eb' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              搜索资产
            </button>
            <button type="button" className="ledger-primary-button" onClick={openCreate}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              录入持仓
            </button>
          </div>
        </div>
      </section>

      <section className="ledger-metric-grid">
        <MetricPanel
          label="投资组合总收益率"
          value={rows.length === 0 ? '--' : percent.format(totalReturn)}
          hint="按持仓市值 / 持仓成本计算"
          primary
          accent={<span>{rows.length} 个持仓</span>}
        />
        <MetricPanel label="总市值" value={rows.length === 0 ? '--' : currency.format(totalValue)} hint={`总成本 ${currency.format(totalCost)}`} />
        <MetricPanel
          label="平均收益指标"
          value={avgYieldMetric == null ? '--' : percent.format(avgYieldMetric)}
          hint="股票优先用未来股息率，基金回落到历史分配收益率"
        />
      </section>

      <AppCard title="资产搜索">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="输入股票、ETF 或基金代码/名称，例如 510880 / 红利ETF / 贵州茅台"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              onPressEnter={openAssetSearch}
            />
            <Button onClick={openAssetSearch}>
              搜索
            </Button>
          </Space.Compact>
          <Typography.Text type="secondary">搜索会进入结果列表页，统一展示股票、ETF 和基金，再选择进入详情或加入自选。</Typography.Text>
          <Typography.Text type="secondary">工作台里的持仓录入现已支持股票、ETF 和基金，输入代码或名称会自动识别资产类型。</Typography.Text>
        </Space>
      </AppCard>

      <AppCard title="持仓明细" extra={<Typography.Text type="secondary">{rows.length} 条</Typography.Text>}>
        <p className="ledger-transaction-hint">同一资产可录入多笔买入/卖出交易，系统按净持仓与净成本汇总展示。</p>
        {rows.length === 0 ? (
          <PageStateBlock
            kind="empty"
            title="当前没有持仓"
            description="可先搜索资产加入自选，或通过“录入持仓”记录你的股票、ETF 或基金仓位。"
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
                    <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>{record.symbol ?? record.code ?? '无代码资产'}</div>
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
                    <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>{record.yieldLabel ?? '暂无口径'}</div>
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
                      onClick={() => goToDetail(record)}
                      disabled={!record.assetKey && !record.symbol}
                    >
                      详情
                    </button>
                    <button type="button" className="ledger-inline-action-btn" onClick={() => openEdit(record)}>
                      编辑
                    </button>
                    <button type="button" className="ledger-inline-action-btn is-danger" onClick={() => onRemoveRow(record)}>
                      删除
                    </button>
                  </Space>
                )
              }
            ]}
          />
        )}
      </AppCard>

      <section className="ledger-section">
        <div className="ledger-section-head">
          <h2>高收益机会（来自当前持仓）</h2>
        </div>
        {opportunities.length === 0 ? (
          <PageStateBlock kind="no-data" title="暂无可计算机会" description="当前持仓中暂无可用的收益指标数据。" />
        ) : (
          <div className="ledger-opportunity-grid">
            {opportunities.map((item) => (
              <button key={item.assetKey ?? item.id} type="button" className="ledger-link-button" onClick={() => goToDetail(item)}>
                <OpportunityCard
                  symbol={item.displayCode}
                  title={item.name}
                  subtitle={`${item.assetType ?? '资产'} · 持仓候选`}
                  value={percent.format(item.yieldMetric)}
                  valueLabel={item.yieldLabel}
                />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="ledger-dual-grid">
        <div className="ledger-section">
          <div className="ledger-section-head">
            <h2>最近浏览</h2>
          </div>
          <div className="ledger-list-card">
            {recentItems.length === 0 ? (
              <PageStateBlock kind="empty" title="暂无最近浏览" description="访问资产详情后，这里会出现最近浏览记录。" />
            ) : (
              recentItems.map((item) => (
                <RecentItem key={item.symbol} title={item.title} subtitle={item.subtitle} onClick={() => goToDetail(item)} />
              ))
            )}
          </div>
        </div>

        <div className="ledger-section">
          <div className="ledger-section-head">
            <h2>快捷工具</h2>
          </div>
          <div className="ledger-tools-stack">
            <ToolCard
              title="收益回测工具"
              subtitle="针对最近标的快速进入回测。"
              onClick={() => {
                const first = rows.find((item) => item.assetKey)?.assetKey
                if (first) {
                  navigate(buildBacktestPathFromAssetKey(first))
                }
              }}
              disabled={!rows.some((item) => item.assetKey)}
            />
            <ToolCard
              title="多股对比"
              subtitle="选择当前持仓前 3 个资产进行对比。"
              onClick={() => {
                const assetKeys = rows.map((item) => item.assetKey).filter((item): item is string => Boolean(item)).slice(0, 3)
                if (assetKeys.length >= 2) {
                  navigate(buildComparisonPathFromAssetKeys(assetKeys))
                }
              }}
              disabled={rows.map((item) => item.assetKey).filter(Boolean).length < 2}
            />
          </div>
        </div>
      </section>

      <PortfolioPositionEditorModal
        open={editorOpen}
        mode={editorMode}
        initialValues={editorInitialValues}
        lockIdentity={Boolean(editorMode === 'edit' && editingRow?.symbol)}
        onCancel={closeEditor}
        onSubmit={onSubmitEditor}
        assetApi={assetApi}
      />
    </div>
  )
}
