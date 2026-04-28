import { message, Modal } from 'antd'
import { useRef, useState } from 'react'
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
import { usePortfolio, type PortfolioRow } from '@renderer/hooks/usePortfolio'
import { usePortfolioRiskMetrics } from '@renderer/hooks/usePortfolioRiskMetrics'
import { CorrelationMatrix } from '@renderer/components/dashboard/CorrelationMatrix'
import { assetApi } from '@renderer/services/assetApi'
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
  replacePortfolioPositionsByAssetInBackend,
  upsertPortfolioPositionInBackend
} from '@renderer/services/portfolioStore'

export function DashboardPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [apiMessage, messageHolder] = message.useMessage()
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
  const { data: riskMetrics } = usePortfolioRiskMetrics(rows)

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
      avgCost: record.avgCost
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
      if (editingRow.symbol) {
        await replacePortfolioPositionsByAssetInBackend(editingRow.assetKey ?? editingRow.symbol, {
          name: editingRow.name,
          shares: values.shares,
          avgCost: values.avgCost
        })
        await reload()
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
      avgCost: values.avgCost
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

  async function onRefresh() {
    const result = await refreshQuotes()
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
        const assetType = (item.assetType ?? 'STOCK') as 'STOCK' | 'ETF' | 'FUND'
        const code = item.code ?? item.symbol ?? ''
        const symbol = item.symbol ?? code
        const assetKey =
          item.symbol ? `STOCK:A_SHARE:${item.symbol}` :
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

      <PortfolioTable
        rows={rows}
        onGoToDetail={(row) => goToDetail(row)}
        onEdit={openEdit}
        onRemove={onRemoveRow}
      />

      <DashboardOpportunities
        opportunities={opportunities}
        onGoToDetail={(row) => goToDetail(row)}
      />

      <CorrelationMatrix
        data={riskMetrics?.correlationMatrix}
        dateRange={riskMetrics?.commonDateRange}
      />

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
        lockIdentity={Boolean(editorMode === 'edit' && editingRow?.symbol)}
        onCancel={closeEditor}
        onSubmit={onSubmitEditor}
        assetApi={assetApi}
      />
    </div>
  )
}
