import { Button, Input, message, Modal, Space, Table, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { StockDetailDto, StockSearchItemDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'
import {
  PortfolioPositionEditorModal,
  type PortfolioEditorInitialValues,
  type PortfolioEditorMode,
  type PortfolioEditorSubmitValues
} from '@renderer/components/dashboard/PortfolioPositionEditorModal'
import { MetricPanel, OpportunityCard, RecentItem, ToolCard } from '@renderer/components/app/LedgerUi'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import { useNavigate } from 'react-router-dom'
import { stockApi } from '@renderer/services/stockApi'
import {
  buildBacktestPath,
  buildComparisonPath,
  buildStockDetailPath,
  getRecentSymbols,
  rememberLastSymbol
} from '@renderer/services/routeContext'
import {
  readPortfolioPositions,
  removePortfolioPosition,
  removePortfolioPositionsBySymbol,
  replacePortfolioPositionsBySymbol,
  type PortfolioPosition,
  upsertPortfolioPosition
} from '@renderer/services/portfolioStore'
import { watchlistApi } from '@renderer/services/watchlistApi'

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
  estimatedFutureYield?: number
  positionReturn?: number
  netShares: number
  transactionCount: number
  netCostAmount: number
}

type PortfolioOpportunity = PortfolioRow & {
  symbol: string
  estimatedFutureYield: number
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [apiMessage, messageHolder] = message.useMessage()
  const [positions, setPositions] = useState<PortfolioPosition[]>(() => readPortfolioPositions())
  const [details, setDetails] = useState<Record<string, StockDetailDto>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [watchlistBusySymbol, setWatchlistBusySymbol] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<StockSearchItemDto[]>([])
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

  const recentSymbols = useMemo(() => getRecentSymbols(), [])

  const rows = useMemo<PortfolioRow[]>(() => {
    const byKey = new Map<string, PortfolioRow>()

    for (const position of positions) {
      const direction = position.direction === 'SELL' ? 'SELL' : 'BUY'
      const signedShares = direction === 'SELL' ? -Math.abs(position.shares) : Math.abs(position.shares)
      const key = position.symbol ? `symbol:${position.symbol}` : `asset:${position.id}`
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
          estimatedFutureYield: undefined,
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
      const symbol = row.symbol ?? ''
      const detail = symbol ? details[symbol] : undefined
      const latestPrice = detail?.latestPrice
      const normalizedNetShares = Math.max(0, row.netShares)
      const marketValue = latestPrice == null ? undefined : latestPrice * normalizedNetShares
      const avgCost = normalizedNetShares > 0 ? row.netCostAmount / normalizedNetShares : row.avgCost
      const costValue = avgCost > 0 ? avgCost * normalizedNetShares : 0
      const positionReturn = marketValue == null || costValue <= 0 ? undefined : marketValue / costValue - 1

      return {
        ...row,
        shares: normalizedNetShares,
        netShares: normalizedNetShares,
        avgCost: avgCost > 0 ? avgCost : row.avgCost,
        latestPrice,
        marketValue: normalizedNetShares > 0 ? marketValue : 0,
        estimatedFutureYield: normalizedNetShares > 0 ? detail?.futureYieldEstimate.estimatedFutureYield : undefined,
        positionReturn
      }
    })

    return merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [details, positions])

  const totalCost = useMemo(() => rows.reduce((sum, item) => sum + item.avgCost * item.shares, 0), [rows])
  const totalValue = useMemo(() => rows.reduce((sum, item) => sum + (item.marketValue ?? 0), 0), [rows])
  const totalReturn = useMemo(() => (totalCost <= 0 ? 0 : totalValue / totalCost - 1), [totalCost, totalValue])
  const avgFutureYield = useMemo(() => {
    const available = rows.filter((row) => row.estimatedFutureYield != null)
    if (available.length === 0) {
      return undefined
    }
    const weighted = available
      .map((item) => {
        const weight = item.marketValue ?? item.avgCost * item.shares
        return {
          weight,
          yield: item.estimatedFutureYield ?? 0
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
      .filter((row): row is PortfolioOpportunity => row.estimatedFutureYield != null && Boolean(row.symbol))
      .sort((a, b) => (b.estimatedFutureYield ?? 0) - (a.estimatedFutureYield ?? 0))
      .slice(0, 4)
  }, [rows])

  const recentItems = useMemo(() => {
    return recentSymbols.slice(0, 5).map((symbol) => {
      const detail = details[symbol]
      return {
        symbol,
        title: detail?.name ?? symbol,
        subtitle: `${symbol} · 最近浏览`
      }
    })
  }, [details, recentSymbols])

  useEffect(() => {
    if (positions.length === 0) {
      setDetails({})
      return
    }
    let disposed = false
    setRefreshing(true)
    const symbols = positions.map((position) => position.symbol).filter((item): item is string => Boolean(item))
    void Promise.allSettled(symbols.map((symbol) => stockApi.getDetail(symbol))).then((results) => {
      if (disposed) {
        return
      }
      const next: Record<string, StockDetailDto> = {}
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          next[result.value.symbol] = result.value
        }
      })
      setDetails(next)
      setRefreshing(false)
    })
    return () => {
      disposed = true
    }
  }, [positions])

  function goToDetail(symbol: string) {
    rememberLastSymbol(symbol)
    navigate(buildStockDetailPath(symbol))
  }

  function openCreate() {
    setEditorMode('create')
    setEditingRow(null)
    setEditorInitialValues({
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
      symbol: record.symbol ?? '',
      name: record.name,
      direction: 'BUY',
      shares: record.netShares,
      avgCost: record.avgCost
    })
    setEditorOpen(true)
  }

  async function searchStocks() {
    const keyword = searchKeyword.trim()
    if (!keyword) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const results = await stockApi.search(keyword)
      setSearchResults(results)
    } catch (error) {
      apiMessage.error(error instanceof Error ? error.message : '搜索失败')
    } finally {
      setSearching(false)
    }
  }

  async function refreshQuotes() {
    if (positions.length === 0) {
      return
    }
    setRefreshing(true)
    const symbols = positions.map((position) => position.symbol).filter((item): item is string => Boolean(item))
    const results = await Promise.allSettled(symbols.map((symbol) => stockApi.getDetail(symbol)))
    const next: Record<string, StockDetailDto> = {}
    let failed = 0
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        next[result.value.symbol] = result.value
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
    const header = ['代码', '名称', '股数', '成本价', '最新价', '持仓成本', '持仓市值', '持仓收益率']
    const lines = rows.map((row) => {
      const costValue = row.avgCost * row.shares
      return [
        row.symbol,
        row.name,
        row.shares.toFixed(4),
        row.avgCost.toFixed(4),
        row.latestPrice?.toFixed(4) ?? '',
        costValue.toFixed(4),
        row.marketValue?.toFixed(4) ?? '',
        row.positionReturn == null ? '' : row.positionReturn.toFixed(6)
      ].join(',')
    })
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `portfolio-report-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
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
        replacePortfolioPositionsBySymbol(editingRow.symbol, {
          name: editingRow.name,
          shares: values.shares,
          avgCost: values.avgCost
        })
        setPositions(readPortfolioPositions())
        closeEditor()
        apiMessage.success('持仓已更新（按当前汇总覆盖）')
        return
      }
      upsertPortfolioPosition({
        id: editingRow.id,
        symbol: undefined,
        name: values.name?.trim() || editingRow.name || '未命名标的',
        direction: 'BUY',
        shares: values.shares,
        avgCost: values.avgCost
      })
      setPositions(readPortfolioPositions())
      closeEditor()
      apiMessage.success('持仓已更新')
      return
    }

    upsertPortfolioPosition({
      id: '',
      symbol: values.symbol,
      name: values.name,
      direction: values.direction,
      shares: values.shares,
      avgCost: values.avgCost
    })
    setPositions(readPortfolioPositions())
    closeEditor()
    apiMessage.success('资产已添加')
  }

  function onPickSearchResult(item: StockSearchItemDto) {
    setEditorMode('create')
    setEditingRow(null)
    setEditorInitialValues({
      symbol: item.symbol,
      name: item.name,
      direction: 'BUY',
      shares: 100,
      avgCost: 10
    })
    setEditorOpen(true)
  }

  async function addSearchResultToWatchlist(item: StockSearchItemDto) {
    try {
      setWatchlistBusySymbol(item.symbol)
      await watchlistApi.add(item.symbol)
      apiMessage.success(`已将 ${item.symbol} ${item.name} 加入自选`)
    } catch (error) {
      apiMessage.error(error instanceof Error ? error.message : '加入自选失败')
    } finally {
      setWatchlistBusySymbol(null)
    }
  }

  function openSearchResultDetail(item: StockSearchItemDto) {
    rememberLastSymbol(item.symbol)
    navigate(buildStockDetailPath(item.symbol))
  }

  function onRemove(id: string) {
    removePortfolioPosition(id)
    setPositions(readPortfolioPositions())
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
            onConfirm: () => {
              removePortfolioPositionsBySymbol(record.symbol!)
              setPositions(readPortfolioPositions())
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
          <div className="ledger-hero-actions">
            <button
              type="button"
              className="ledger-secondary-button"
              disabled={rows.length === 0}
              onClick={exportReport}
            >
              导出报告
            </button>
            <button type="button" className="ledger-secondary-button" disabled={rows.length === 0} onClick={refreshQuotes}>
              {refreshing ? '刷新中...' : '刷新估值'}
            </button>
            <button type="button" className="ledger-primary-button" onClick={openCreate}>
              添加资产
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
          label="平均未来股息率"
          value={avgFutureYield == null ? '--' : percent.format(avgFutureYield)}
          hint="按持仓权重（市值优先）加权计算"
        />
      </section>

      <AppCard title="持仓搜索与录入">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="输入股票代码或名称，例如 600519 / 贵州茅台"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              onPressEnter={searchStocks}
            />
            <Button loading={searching} onClick={searchStocks}>
              搜索
            </Button>
          </Space.Compact>
          {searchResults.length === 0 ? (
            <Typography.Text type="secondary">暂无搜索结果，输入关键词后点击搜索。</Typography.Text>
          ) : (
            <Space wrap>
              {searchResults.map((item) => (
                <Space key={item.symbol} size={8}>
                  <Button onClick={() => onPickSearchResult(item)}>录入持仓 {item.symbol}</Button>
                  <Button onClick={() => openSearchResultDetail(item)}>查看详情</Button>
                  <Button
                    type="primary"
                    ghost
                    loading={watchlistBusySymbol === item.symbol}
                    onClick={() => addSearchResultToWatchlist(item)}
                  >
                    加入自选
                  </Button>
                </Space>
              ))}
            </Space>
          )}
        </Space>
      </AppCard>

      <AppCard title="持仓明细" extra={<Typography.Text type="secondary">{rows.length} 条</Typography.Text>}>
        <p className="ledger-transaction-hint">同一标的可录入多笔买入/卖出交易，系统按净股数与净成本汇总展示。</p>
        {rows.length === 0 ? (
          <PageStateBlock
            kind="empty"
            title="当前没有持仓"
            description="先通过“添加资产”录入你的真实持仓，再查看估值和收益。"
          />
        ) : (
          <Table
            className="soft-table"
            rowKey="id"
            pagination={false}
            dataSource={rows}
            columns={[
              {
                title: '股票',
                render: (_, record) => (
                  <div>
                    <Space size={8}>
                      <Typography.Text strong>{record.name}</Typography.Text>
                      {record.transactionCount > 1 ? <Tag color="orange">多笔交易</Tag> : null}
                    </Space>
                    <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>{record.symbol ?? '无代码资产'}</div>
                  </div>
                )
              },
              {
                title: '股数',
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
                title: '操作',
                render: (_, record) => (
                  <Space className="ledger-inline-action-group">
                    <button
                      type="button"
                      className="ledger-inline-action-btn"
                      onClick={() => record.symbol && goToDetail(record.symbol)}
                      disabled={!record.symbol}
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
          <h2>高股息机会（来自当前持仓）</h2>
        </div>
        {opportunities.length === 0 ? (
          <PageStateBlock kind="no-data" title="暂无可计算机会" description="当前持仓中暂无可用的未来股息率数据。" />
        ) : (
          <div className="ledger-opportunity-grid">
            {opportunities.map((item) => (
              <button key={item.symbol} type="button" className="ledger-link-button" onClick={() => goToDetail(item.symbol)}>
                <OpportunityCard
                  symbol={item.symbol}
                  title={item.name}
                  subtitle="持仓候选"
                  value={percent.format(item.estimatedFutureYield ?? 0)}
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
              <PageStateBlock kind="empty" title="暂无最近浏览" description="访问个股详情后，这里会出现最近浏览记录。" />
            ) : (
              recentItems.map((item) => (
                <RecentItem key={item.symbol} title={item.title} subtitle={item.subtitle} onClick={() => goToDetail(item.symbol)} />
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
                const first = rows.find((item) => item.symbol)?.symbol
                if (first) {
                  navigate(buildBacktestPath(first))
                }
              }}
              disabled={!rows.some((item) => item.symbol)}
            />
            <ToolCard
              title="多股对比"
              subtitle="选择当前持仓前 3 只进行对比。"
              onClick={() => {
                const symbols = rows.map((item) => item.symbol).filter((item): item is string => Boolean(item)).slice(0, 3)
                if (symbols.length >= 2) {
                  navigate(buildComparisonPath(symbols))
                }
              }}
              disabled={rows.map((item) => item.symbol).filter(Boolean).length < 2}
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
        stockApi={stockApi}
      />
    </div>
  )
}
