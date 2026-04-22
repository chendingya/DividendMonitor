import { Button, Form, Input, InputNumber, message, Modal, Space, Table, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { StockDetailDto, StockSearchItemDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'
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
  type PortfolioPosition,
  upsertPortfolioPosition
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
  estimatedFutureYield?: number
  positionReturn?: number
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
  const [searchResults, setSearchResults] = useState<StockSearchItemDto[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form] = Form.useForm<{ symbol: string; name: string; shares: number; avgCost: number }>()

  function pickBestSearchResult(keyword: string, results: StockSearchItemDto[]) {
    const normalized = keyword.trim()
    if (!normalized) {
      return results[0]
    }
    const exactSymbol = results.find((item) => item.symbol === normalized)
    if (exactSymbol) {
      return exactSymbol
    }
    const exactName = results.find((item) => item.name === normalized)
    if (exactName) {
      return exactName
    }
    const startsWithName = results.find((item) => item.name.startsWith(normalized))
    if (startsWithName) {
      return startsWithName
    }
    return results[0]
  }

  const recentSymbols = useMemo(() => getRecentSymbols(), [])

  const rows = useMemo<PortfolioRow[]>(() => {
    return positions.map((position) => {
      const symbol = position.symbol ?? ''
      const detail = symbol ? details[symbol] : undefined
      const latestPrice = detail?.latestPrice
      const marketValue = latestPrice == null ? undefined : latestPrice * position.shares
      const costValue = position.avgCost * position.shares
      const positionReturn = marketValue == null || costValue <= 0 ? undefined : marketValue / costValue - 1
      return {
        ...position,
        latestPrice,
        marketValue,
        estimatedFutureYield: detail?.futureYieldEstimate.estimatedFutureYield,
        positionReturn
      }
    })
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
    setEditingId(null)
    form.setFieldsValue({
      symbol: '',
      name: '',
      shares: 100,
      avgCost: 10
    })
    setEditorOpen(true)
  }

  function openEdit(record: PortfolioPosition) {
    setEditingId(record.id)
    form.setFieldsValue(record)
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

  async function onSubmitPosition() {
    try {
      const values = await form.validateFields()
      const symbolRaw = values.symbol?.trim() ?? ''
      const nameRaw = values.name?.trim() ?? ''
      let resolvedSymbol = symbolRaw
      let resolvedName = nameRaw

      if (!resolvedSymbol && !resolvedName) {
        apiMessage.error('股票代码和名称至少填写一个')
        return
      }

      if (resolvedSymbol && !resolvedName) {
        const results = await stockApi.search(resolvedSymbol)
        const best = pickBestSearchResult(resolvedSymbol, results)
        if (!best) {
          apiMessage.error('未能根据代码匹配股票名称，请补充名称或更换代码')
          return
        }
        resolvedName = best.name
        resolvedSymbol = best.symbol
        form.setFieldsValue({
          symbol: best.symbol,
          name: best.name
        })
      }

      if (!resolvedSymbol && resolvedName) {
        const results = await stockApi.search(resolvedName)
        const best = pickBestSearchResult(resolvedName, results)
        if (!best) {
          apiMessage.error('未能根据名称匹配股票代码，请补充代码或更换名称')
          return
        }
        resolvedSymbol = best.symbol
        resolvedName = best.name
        form.setFieldsValue({
          symbol: best.symbol,
          name: best.name
        })
      }

      const symbol = resolvedSymbol || undefined
      const name = resolvedName || `无代码资产-${new Date().toISOString().slice(0, 10)}`
      upsertPortfolioPosition({
        id: editingId ?? '',
        symbol,
        name,
        shares: values.shares,
        avgCost: values.avgCost
      })
      setPositions(readPortfolioPositions())
      setEditorOpen(false)
      apiMessage.success(editingId ? '持仓已更新' : '资产已添加')
    } catch (error) {
      if (error instanceof Error) {
        apiMessage.error(error.message)
      }
    }
  }

  function onPickSearchResult(item: StockSearchItemDto) {
    setEditingId(null)
    form.setFieldsValue({
      symbol: item.symbol,
      name: item.name,
      shares: 100,
      avgCost: 10
    })
    setEditorOpen(true)
  }

  async function onSymbolBlur() {
    const symbol = form.getFieldValue('symbol')?.trim()
    const name = form.getFieldValue('name')?.trim()
    if (!symbol || name) {
      return
    }
    if (!/^(6|0|3)\d{5}$/.test(symbol)) {
      return
    }
    try {
      const results = await stockApi.search(symbol)
      const best = pickBestSearchResult(symbol, results)
      if (best) {
        form.setFieldsValue({ symbol: best.symbol, name: best.name })
      }
    } catch {
      // ignore blur-time lookup failures
    }
  }

  async function onNameBlur() {
    const symbol = form.getFieldValue('symbol')?.trim()
    const name = form.getFieldValue('name')?.trim()
    if (!name || symbol) {
      return
    }
    try {
      const results = await stockApi.search(name)
      const best = pickBestSearchResult(name, results)
      if (best) {
        form.setFieldsValue({ symbol: best.symbol, name: best.name })
      }
    } catch {
      // ignore blur-time lookup failures
    }
  }

  function onRemove(id: string) {
    removePortfolioPosition(id)
    setPositions(readPortfolioPositions())
    apiMessage.success('已移除持仓')
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
                <Button key={item.symbol} onClick={() => onPickSearchResult(item)}>
                  选择 {item.symbol} {item.name}
                </Button>
              ))}
            </Space>
          )}
        </Space>
      </AppCard>

      <AppCard title="持仓明细" extra={<Typography.Text type="secondary">{rows.length} 条</Typography.Text>}>
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
                    <Typography.Text strong>{record.name}</Typography.Text>
                    <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>{record.symbol ?? '无代码资产'}</div>
                  </div>
                )
              },
              {
                title: '股数',
                dataIndex: 'shares',
                render: (value: number) => value.toFixed(2)
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
                    <button type="button" className="ledger-inline-action-btn is-danger" onClick={() => onRemove(record.id)}>
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

      <Modal
        open={editorOpen}
        title={editingId ? '编辑持仓' : '添加资产'}
        onCancel={() => setEditorOpen(false)}
        onOk={onSubmitPosition}
        okText={editingId ? '保存修改' : '添加'}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="股票代码"
            name="symbol"
            rules={[
              {
                validator: async (_, value: string | undefined) => {
                  const raw = value?.trim()
                  if (!raw) {
                    return
                  }
                  if (!/^(6|0|3)\d{5}$/.test(raw)) {
                    throw new Error('若填写代码，仅支持 A 股 6 位代码')
                  }
                }
              }
            ]}
          >
            <Input
              placeholder="可选，例如 600519；不填则可通过名称自动反查"
              disabled={Boolean(editingId)}
              onBlur={onSymbolBlur}
            />
          </Form.Item>
          <Form.Item label="股票名称" name="name">
            <Input placeholder="可选，例如 贵州茅台；可自动反查代码" onBlur={onNameBlur} />
          </Form.Item>
          <Form.Item label="持仓股数" name="shares" rules={[{ required: true, message: '请输入持仓股数' }]}>
            <InputNumber min={1} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="持仓成本价" name="avgCost" rules={[{ required: true, message: '请输入成本价' }]}>
            <InputNumber min={0.01} precision={4} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
