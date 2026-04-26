import { Alert, Skeleton } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import { BacktestSummaryCard } from '@renderer/components/backtest/BacktestSummaryCard'
import { DEFAULT_BACKTEST_BUY_DATE, DEFAULT_STOCK_SYMBOL } from '@renderer/defaults'
import { useAssetBacktest } from '@renderer/hooks/useAssetBacktest'
import { buildStockAssetKey } from '@shared/contracts/api'
import {
  buildAssetDetailPath,
  getRememberedLastAssetKey,
  parseAssetKeyFromSearch,
  parseSymbolFromSearch,
  rememberLastAssetKey
} from '@renderer/services/routeContext'

export function BacktestPage() {
  const navigate = useNavigate()
  const { symbol: routeSymbol } = useParams<{ symbol?: string }>()
  const [searchParams] = useSearchParams()
  const assetKey = useMemo(() => {
    const byAssetKey = parseAssetKeyFromSearch(searchParams)
    if (byAssetKey) {
      return byAssetKey
    }

    const bySearch = parseSymbolFromSearch(searchParams)
    if (bySearch) {
      return buildStockAssetKey(bySearch)
    }
    if (routeSymbol) {
      return buildStockAssetKey(routeSymbol)
    }
    return getRememberedLastAssetKey() ?? buildStockAssetKey(DEFAULT_STOCK_SYMBOL)
  }, [routeSymbol, searchParams])
  const [buyDate, setBuyDate] = useState(DEFAULT_BACKTEST_BUY_DATE)
  const { data, loading, error } = useAssetBacktest(assetKey, buyDate)

  useEffect(() => {
    rememberLastAssetKey(assetKey)
  }, [assetKey])

  return (
    <div className="ledger-page">
      <section className="ledger-watchlist-header">
        <div>
          <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>
            分红复投回测
          </h1>
          <p className="ledger-hero-subtitle">选择回测买入日期，系统按真实历史行情与分红事件计算复投结果。</p>
        </div>
        <div className="ledger-hero-actions">
          <input
            type="date"
            className="ledger-date-input"
            value={buyDate}
            onChange={(event) => setBuyDate(event.target.value)}
          />
          <button type="button" className="ledger-secondary-button" onClick={() => navigate(buildAssetDetailPath(assetKey))}>
            返回详情
          </button>
        </div>
      </section>

      {loading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {!loading && error ? <Alert type="error" message={error} /> : null}
      {!loading && !error && !assetKey.trim() ? (
        <PageStateBlock
          kind="empty"
          title="还没有选择回测标的"
          description="请先进入某个资产详情页，再发起回测。"
        />
      ) : null}
      {!loading && !error && assetKey.trim() && !data ? (
        <PageStateBlock
          kind="no-data"
          title="当前条件暂无回测结果"
          description="系统未返回可展示的回测数据，请调整条件后重试。"
        />
      ) : null}
      {!loading && !error && data && data.transactions.length === 0 ? (
        <PageStateBlock
          kind="no-data"
          title="当前区间暂无可回测流水"
          description="该股票在所选买入日期后缺少交易或分红事件，暂无法生成流水。"
        />
      ) : null}
      {!loading && !error && data && data.transactions.length > 0 ? <BacktestSummaryCard result={data} /> : null}
    </div>
  )
}
