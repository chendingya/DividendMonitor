import { Alert, Col, Input, Row, Select, Skeleton, Space, message } from 'antd'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { WatchlistTable } from '@renderer/components/watchlist/WatchlistTable'
import { useWatchlist } from '@renderer/hooks/useWatchlist'
import {
  buildComparisonPath,
  buildStockDetailPath,
  rememberComparisonSymbols,
  rememberLastSymbol
} from '@renderer/services/routeContext'

export function WatchlistPage() {
  const navigate = useNavigate()
  const [apiMessage, messageHolder] = message.useMessage()
  const [keyword, setKeyword] = useState('')
  const [sortBy, setSortBy] = useState<'yield-desc' | 'yield-asc' | 'symbol-asc' | 'price-desc'>('yield-desc')
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([])
  const { data, loading, error, reload, remove, mutatingSymbol } = useWatchlist()
  const filteredData = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    const next = data.filter((item) => {
      if (!normalizedKeyword) {
        return true
      }

      return item.symbol.toLowerCase().includes(normalizedKeyword) || item.name.toLowerCase().includes(normalizedKeyword)
    })

    next.sort((left, right) => {
      if (sortBy === 'symbol-asc') {
        return left.symbol.localeCompare(right.symbol)
      }

      if (sortBy === 'price-desc') {
        return right.latestPrice - left.latestPrice
      }

      const leftYield = left.estimatedFutureYield ?? (sortBy === 'yield-asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
      const rightYield = right.estimatedFutureYield ?? (sortBy === 'yield-asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
      return sortBy === 'yield-asc' ? leftYield - rightYield : rightYield - leftYield
    })

    return next
  }, [data, keyword, sortBy])
  const topSymbols = useMemo(() => filteredData.slice(0, 3).map((item) => item.symbol), [filteredData])
  const selectedAvailableSymbols = useMemo(
    () => selectedSymbols.filter((symbol) => filteredData.some((item) => item.symbol === symbol)),
    [filteredData, selectedSymbols]
  )
  const avgYield = useMemo(() => {
    const values = filteredData.map((item) => item.estimatedFutureYield).filter((item): item is number => item != null)
    if (values.length === 0) {
      return null
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }, [filteredData])
  const maxYieldItem = useMemo(() => {
    return [...filteredData]
      .filter((item) => item.estimatedFutureYield != null)
      .sort((a, b) => (b.estimatedFutureYield ?? 0) - (a.estimatedFutureYield ?? 0))[0]
  }, [filteredData])

  function goToFirstDetail() {
    const first = filteredData[0]
    if (!first) {
      return
    }
    rememberLastSymbol(first.symbol)
    navigate(buildStockDetailPath(first.symbol))
  }

  function goToDetail(symbol: string) {
    rememberLastSymbol(symbol)
    navigate(buildStockDetailPath(symbol))
  }

  function goToComparison() {
    if (topSymbols.length === 0) {
      return
    }
    rememberComparisonSymbols(topSymbols)
    navigate(buildComparisonPath(topSymbols))
  }

  function toggleSelect(symbol: string) {
    setSelectedSymbols((current) => {
      if (current.includes(symbol)) {
        return current.filter((item) => item !== symbol)
      }
      return [...current, symbol].slice(0, 10)
    })
  }

  function selectTopThree() {
    setSelectedSymbols(filteredData.slice(0, 3).map((item) => item.symbol))
  }

  function clearSelection() {
    setSelectedSymbols([])
  }

  function goToSelectedComparison() {
    if (selectedAvailableSymbols.length < 2) {
      return
    }
    rememberComparisonSymbols(selectedAvailableSymbols)
    navigate(buildComparisonPath(selectedAvailableSymbols))
  }

  async function removeFromWatchlist(symbol: string) {
    try {
      await remove(symbol)
      apiMessage.success(`已将 ${symbol} 移出自选`)
    } catch (actionError) {
      apiMessage.error(actionError instanceof Error ? actionError.message : '移除自选失败')
    }
  }

  async function refreshWatchlist() {
    try {
      await reload()
      apiMessage.success('自选列表已刷新')
    } catch (actionError) {
      apiMessage.error(actionError instanceof Error ? actionError.message : '刷新自选失败')
    }
  }

  if (loading) {
    return <Skeleton active paragraph={{ rows: 6 }} />
  }

  if (error) {
    return <Alert type="error" message={error} />
  }

  return (
    <div className="ledger-page">
      {messageHolder}
      <section className="ledger-watchlist-header">
        <div>
          <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>
            自选
          </h1>
          <p className="ledger-hero-subtitle">监控高收益机会与自定义关注清单。</p>
        </div>
        <div className="ledger-hero-actions">
          <button type="button" className="ledger-secondary-button" onClick={goToFirstDetail} disabled={filteredData.length === 0}>
            查看首个详情
          </button>
          <button type="button" className="ledger-primary-button" onClick={goToComparison} disabled={topSymbols.length < 2}>
            对比前 3 只
          </button>
        </div>
      </section>

      <section className="ledger-metric-grid">
        <div className="ledger-metric-panel is-primary">
          <div className="ledger-metric-label">平均未来股息率</div>
          <div className="ledger-metric-value">{avgYield == null ? '--' : `${(avgYield * 100).toFixed(2)}%`}</div>
          <div className="ledger-metric-hint">基于当前筛选结果中的可计算标的</div>
        </div>
        <div className="ledger-metric-panel">
          <div className="ledger-metric-label">追踪资产数量</div>
          <div className="ledger-metric-value">{filteredData.length}</div>
          <div className="ledger-metric-hint">{keyword.trim() ? `共 ${data.length} 只，当前展示 ${filteredData.length} 只` : '来自本地自选与真实数据链路'}</div>
        </div>
        <div className="ledger-metric-panel">
          <div className="ledger-metric-label">最高估算股息率</div>
          <div className="ledger-metric-value">
            {maxYieldItem?.estimatedFutureYield == null ? '--' : `${(maxYieldItem.estimatedFutureYield * 100).toFixed(2)}%`}
          </div>
          <div className="ledger-metric-hint">{maxYieldItem ? `${maxYieldItem.symbol} ${maxYieldItem.name}` : '暂无可计算结果'}</div>
        </div>
      </section>

      <section className="ledger-filter-bar" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
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
              { value: 'yield-desc', label: '按未来股息率从高到低' },
              { value: 'yield-asc', label: '按未来股息率从低到高' },
              { value: 'price-desc', label: '按最新价从高到低' },
              { value: 'symbol-asc', label: '按股票代码排序' }
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
      </section>

      <section className="ledger-filter-bar" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Space wrap size={12}>
          <span className="pill primary">已选 {selectedAvailableSymbols.length} 只</span>
          <button type="button" className="ledger-filter-chip" onClick={selectTopThree} disabled={filteredData.length === 0}>
            选中前 3 只
          </button>
          <button type="button" className="ledger-filter-chip" onClick={clearSelection} disabled={selectedSymbols.length === 0}>
            清空选择
          </button>
        </Space>
        <Space wrap size={12}>
          <button
            type="button"
            className="ledger-primary-button"
            onClick={goToSelectedComparison}
            disabled={selectedAvailableSymbols.length < 2}
          >
            批量进入对比
          </button>
        </Space>
      </section>

      <Row gutter={[20, 20]}>
        <Col span={24}>
          <WatchlistTable
            items={filteredData}
            removingSymbol={mutatingSymbol}
            selectedSymbols={selectedAvailableSymbols}
            onOpenDetail={goToDetail}
            onRemove={removeFromWatchlist}
            onToggleSelect={toggleSelect}
          />
        </Col>
      </Row>
    </div>
  )
}
