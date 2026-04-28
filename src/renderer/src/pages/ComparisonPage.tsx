import { Alert, Col, Row, Skeleton } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import { AssetAvatar } from '@renderer/components/app/AssetAvatar'
import { ComparisonTable } from '@renderer/components/comparison/ComparisonTable'
import { DEFAULT_COMPARISON_SYMBOLS } from '@renderer/defaults'
import { useAssetComparison } from '@renderer/hooks/useAssetComparison'
import {
  buildAssetDetailPath,
  getRememberedComparisonAssetKeys,
  parseAssetKeysFromSearch,
  parseSymbolsFromSearch,
  rememberComparisonAssetKeys,
  rememberLastAssetKey
} from '@renderer/services/routeContext'
import { listPortfolioPositionsFromBackend } from '@renderer/services/portfolioStore'
import { buildStockAssetKey } from '@shared/contracts/api'

export function ComparisonPage() {
  const navigate = useNavigate()
  const [valuationWindow, setValuationWindow] = useState<'10Y' | '20Y'>('10Y')
  const [portfolioAssetKeys, setPortfolioAssetKeys] = useState<string[]>([])
  const { symbols: routeSymbols } = useParams<{ symbols?: string }>()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    let disposed = false
    void listPortfolioPositionsFromBackend()
      .then((items) => {
        if (!disposed) {
          setPortfolioAssetKeys(
            items
              .map((item) => item.assetKey)
              .filter((item): item is string => Boolean(item))
              .slice(0, 3)
          )
        }
      })
      .catch(() => {})

    return () => {
      disposed = true
    }
  }, [])

  const assetKeys = useMemo(() => {
    const byAssetQuery = parseAssetKeysFromSearch(searchParams)
    if (byAssetQuery.length > 0) {
      return byAssetQuery
    }

    const byQuery = parseSymbolsFromSearch(searchParams).map((symbol) => buildStockAssetKey(symbol))
    if (byQuery.length > 0) {
      return byQuery
    }
    if (routeSymbols) {
      const byRoute = routeSymbols
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
      if (byRoute.length > 0) {
        return byRoute.map((symbol) => buildStockAssetKey(symbol))
      }
    }
    const remembered = getRememberedComparisonAssetKeys()
    if (remembered.length > 0) {
      return remembered
    }
    if (portfolioAssetKeys.length > 0) {
      return portfolioAssetKeys
    }
    return DEFAULT_COMPARISON_SYMBOLS.map((symbol) => buildStockAssetKey(symbol))
  }, [portfolioAssetKeys, routeSymbols, searchParams])
  const { data, loading, error } = useAssetComparison(assetKeys)

  const contextAssetKeys = useMemo(
    () => data.map((item) => item.assetKey).filter((assetKey) => assetKey.length > 0),
    [data]
  )

  useEffect(() => {
    if (contextAssetKeys.length > 0) {
      rememberComparisonAssetKeys(contextAssetKeys)
    }
  }, [contextAssetKeys])

  function goToDetail(assetKey: string) {
    rememberLastAssetKey(assetKey)
    rememberComparisonAssetKeys(contextAssetKeys)
    navigate(buildAssetDetailPath(assetKey, contextAssetKeys))
  }

  if (loading) {
    return <Skeleton active paragraph={{ rows: 6 }} />
  }

  if (error) {
    return <Alert type="error" message={error} />
  }

  if (assetKeys.length === 0) {
    return (
      <PageStateBlock
        kind="empty"
        title="还没有选择对比标的"
        description="请从自选页或搜索入口先添加至少 1 只资产，再进入对比页。"
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
        <h1 className="hero-title">{contextAssetKeys.length} 只标的同屏比较</h1>
        <p className="hero-subtitle">把估值、收益率与历史分位放在同一张表里，便于横向查看股票与 ETF 的差异。</p>
        <div className="comparison-hero-summary">
          <span className="pill primary">当前对比 {contextAssetKeys.length} 只</span>
          <span className="pill">默认按收益率指标降序</span>
          <span className="pill">支持点击表头重新排序</span>
        </div>
        <div className="comparison-hero-symbols" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {data.map((item) => (
            <span key={item.assetKey} className="comparison-hero-symbol-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AssetAvatar name={item.name} assetType={item.assetType} size={20} />
              {item.symbol ?? item.code}
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
