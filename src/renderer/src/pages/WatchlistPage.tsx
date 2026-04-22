import { Alert, Col, Row, Skeleton } from 'antd'
import { useMemo } from 'react'
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
  const { data, loading, error } = useWatchlist()
  const topSymbols = useMemo(() => data.slice(0, 3).map((item) => item.symbol), [data])
  const avgYield = useMemo(() => {
    const values = data.map((item) => item.estimatedFutureYield).filter((item): item is number => item != null)
    if (values.length === 0) {
      return null
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }, [data])
  const maxYieldItem = useMemo(() => {
    return [...data]
      .filter((item) => item.estimatedFutureYield != null)
      .sort((a, b) => (b.estimatedFutureYield ?? 0) - (a.estimatedFutureYield ?? 0))[0]
  }, [data])

  function goToFirstDetail() {
    const first = data[0]
    if (!first) {
      return
    }
    rememberLastSymbol(first.symbol)
    navigate(buildStockDetailPath(first.symbol))
  }

  function goToComparison() {
    if (topSymbols.length === 0) {
      return
    }
    rememberComparisonSymbols(topSymbols)
    navigate(buildComparisonPath(topSymbols))
  }

  if (loading) {
    return <Skeleton active paragraph={{ rows: 6 }} />
  }

  if (error) {
    return <Alert type="error" message={error} />
  }

  return (
    <div className="ledger-page">
      <section className="ledger-watchlist-header">
        <div>
          <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>
            自选
          </h1>
          <p className="ledger-hero-subtitle">监控高收益机会与自定义关注清单。</p>
        </div>
        <div className="ledger-hero-actions">
          <button type="button" className="ledger-secondary-button" onClick={goToFirstDetail} disabled={data.length === 0}>
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
          <div className="ledger-metric-hint">基于当前自选可计算标的</div>
        </div>
        <div className="ledger-metric-panel">
          <div className="ledger-metric-label">追踪资产数量</div>
          <div className="ledger-metric-value">{data.length}</div>
          <div className="ledger-metric-hint">来自真实数据链路</div>
        </div>
        <div className="ledger-metric-panel">
          <div className="ledger-metric-label">最高估算股息率</div>
          <div className="ledger-metric-value">
            {maxYieldItem?.estimatedFutureYield == null ? '--' : `${(maxYieldItem.estimatedFutureYield * 100).toFixed(2)}%`}
          </div>
          <div className="ledger-metric-hint">{maxYieldItem ? `${maxYieldItem.symbol} ${maxYieldItem.name}` : '暂无可计算结果'}</div>
        </div>
      </section>

      <section className="ledger-filter-bar">
        <button type="button" className="ledger-filter-chip is-active">
          真实数据
        </button>
        <button type="button" className="ledger-filter-chip" onClick={() => navigate('/')}>
          回到投资组合
        </button>
        <button type="button" className="ledger-filter-chip" onClick={() => navigate('/comparison')}>
          打开对比页
        </button>
        <button type="button" className="ledger-filter-chip" onClick={() => window.location.reload()}>
          刷新页面
        </button>
      </section>

      <Row gutter={[20, 20]}>
        <Col span={24}>
          <WatchlistTable items={data} />
        </Col>
      </Row>
    </div>
  )
}
