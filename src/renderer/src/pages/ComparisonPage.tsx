import { Alert, Col, Row, Skeleton } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import { ComparisonTable } from '@renderer/components/comparison/ComparisonTable'
import { DEFAULT_COMPARISON_SYMBOLS } from '@renderer/defaults'
import { useComparison } from '@renderer/hooks/useComparison'
import {
  buildStockDetailPath,
  getRememberedComparisonSymbols,
  parseSymbolsFromSearch,
  rememberComparisonSymbols,
  rememberLastSymbol
} from '@renderer/services/routeContext'
import { readPortfolioPositions } from '@renderer/services/portfolioStore'

export function ComparisonPage() {
  const navigate = useNavigate()
  const [valuationWindow, setValuationWindow] = useState<'10Y' | '20Y'>('10Y')
  const { symbols: routeSymbols } = useParams<{ symbols?: string }>()
  const [searchParams] = useSearchParams()
  const symbols = useMemo(() => {
    const byQuery = parseSymbolsFromSearch(searchParams)
    if (byQuery.length > 0) {
      return byQuery
    }
    if (routeSymbols) {
      const byRoute = routeSymbols
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
      if (byRoute.length > 0) {
        return byRoute
      }
    }
    const remembered = getRememberedComparisonSymbols()
    if (remembered.length > 0) {
      return remembered
    }
    const portfolioSymbols = readPortfolioPositions()
      .map((item) => item.symbol)
      .filter((item): item is string => Boolean(item))
      .slice(0, 3)
    if (portfolioSymbols.length > 0) {
      return portfolioSymbols
    }
    return DEFAULT_COMPARISON_SYMBOLS
  }, [routeSymbols, searchParams])
  const { data, loading, error } = useComparison(symbols)

  const contextSymbols = useMemo(
    () => data.map((item) => item.symbol).filter((symbol) => symbol.length > 0),
    [data]
  )

  useEffect(() => {
    if (contextSymbols.length > 0) {
      rememberComparisonSymbols(contextSymbols)
    }
  }, [contextSymbols])

  function goToDetail(symbol: string) {
    rememberLastSymbol(symbol)
    rememberComparisonSymbols(contextSymbols)
    navigate(buildStockDetailPath(symbol, contextSymbols))
  }

  if (loading) {
    return <Skeleton active paragraph={{ rows: 6 }} />
  }

  if (error) {
    return <Alert type="error" message={error} />
  }

  if (symbols.length === 0) {
    return (
      <PageStateBlock
        kind="empty"
        title="还没有选择对比标的"
        description="请从自选页或搜索入口先添加至少 1 只股票，再进入对比页。"
      />
    )
  }

  if (data.length === 0) {
    return (
      <PageStateBlock
        kind="no-data"
        title="当前标的暂无可对比数据"
        description="可尝试更换股票代码，或稍后重试以等待数据同步。"
      />
    )
  }

  return (
    <div className="page-section">
      <section className="page-hero comparison-hero">
        <div className="hero-eyebrow">对比分析</div>
        <h1 className="hero-title">{contextSymbols.length} 只标的同屏比较</h1>
        <p className="hero-subtitle">把 PE、PB 与十年 / 二十年估值分位一起横向查看，便于判断高股息背后的估值位置。</p>
        <div className="comparison-hero-summary">
          <span className="pill primary">当前对比 {contextSymbols.length} 只</span>
          <span className="pill">默认按估算未来股息率降序</span>
          <span className="pill">支持点击表头重新排序</span>
        </div>
        <div className="comparison-hero-symbols">
          {contextSymbols.map((symbol) => (
            <span key={symbol} className="comparison-hero-symbol-chip">
              {symbol}
            </span>
          ))}
        </div>
        <div className="hero-actions">
          <div className="ledger-segmented-control">
            <button
              type="button"
              className={`ledger-filter-chip ${valuationWindow === '10Y' ? 'is-active' : ''}`}
              onClick={() => setValuationWindow('10Y')}
            >
              10年分位
            </button>
            <button
              type="button"
              className={`ledger-filter-chip ${valuationWindow === '20Y' ? 'is-active' : ''}`}
              onClick={() => setValuationWindow('20Y')}
            >
              20年分位
            </button>
          </div>
          <button type="button" className="ledger-secondary-button" onClick={() => navigate('/watchlist')}>
            返回自选页
          </button>
        </div>
      </section>
      <Row gutter={[20, 20]}>
        <Col span={24}>
          <ComparisonTable items={data} valuationWindow={valuationWindow} onOpenDetail={goToDetail} />
        </Col>
      </Row>
    </div>
  )
}
