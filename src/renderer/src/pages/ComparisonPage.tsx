import { Alert, Col, Row, Skeleton } from 'antd'
import { useEffect, useMemo } from 'react'
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
      <section className="page-hero">
        <div className="hero-eyebrow">对比分析</div>
        <h1 className="hero-title">全量比较</h1>
        <p className="hero-subtitle">关键收益指标最值高亮</p>
        <div className="hero-actions">
          <button type="button" className="ledger-secondary-button" onClick={() => navigate('/')}>
            返回投资组合
          </button>
          {contextSymbols.map((symbol) => (
            <button key={symbol} type="button" className="ledger-secondary-button" onClick={() => goToDetail(symbol)}>
              查看 {symbol} 详情
            </button>
          ))}
        </div>
      </section>
      <Row gutter={[20, 20]}>
        <Col span={24}>
          <ComparisonTable items={data} />
        </Col>
      </Row>
    </div>
  )
}
