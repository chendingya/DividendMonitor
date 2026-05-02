import { Alert, Skeleton, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import { BacktestSummaryCard } from '@renderer/components/backtest/BacktestSummaryCard'
import { BacktestNavChart } from '@renderer/components/backtest/BacktestNavChart'
import { BacktestMultiCompare } from '@renderer/components/backtest/BacktestMultiCompare'
import { DEFAULT_BACKTEST_BUY_DATE, DEFAULT_STOCK_SYMBOL } from '@renderer/defaults'
import { useSettings } from '@renderer/hooks/useSettings'
import { useAssetBacktest, type BacktestParams } from '@renderer/hooks/useAssetBacktest'
import { buildStockAssetKey } from '@shared/contracts/api'
import type { BacktestResultDto } from '@shared/contracts/api'
import { getCalculationDesktopApi, getBacktestDesktopApi } from '@renderer/services/desktopApi'
import {
  buildAssetDetailPath,
  getRememberedLastAssetKey,
  parseAssetKeyFromSearch,
  parseSymbolFromSearch,
  rememberLastAssetKey
} from '@renderer/services/routeContext'

const BENCHMARK_OPTIONS = [
  { value: '', label: '无基准' },
  { value: '000300', label: '沪深300' },
  { value: '000016', label: '上证50' },
  { value: '000905', label: '中证500' }
]

export function BacktestPage() {
  const navigate = useNavigate()
  const { symbol: routeSymbol } = useParams<{ symbol?: string }>()
  const [searchParams] = useSearchParams()

  // Parse multi symbols from URL (comma-separated)
  const assetKeys = useMemo(() => {
    const symbolsParam = searchParams.get('symbols')
    if (symbolsParam) {
      return symbolsParam.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
        if (s.includes(':')) return s
        return buildStockAssetKey(s)
      })
    }
    const byAssetKey = parseAssetKeyFromSearch(searchParams)
    if (byAssetKey) return [byAssetKey]
    const bySearch = parseSymbolFromSearch(searchParams)
    if (bySearch) return [buildStockAssetKey(bySearch)]
    if (routeSymbol) return [buildStockAssetKey(routeSymbol)]
    const remembered = getRememberedLastAssetKey()
    if (remembered) return [remembered]
    return [buildStockAssetKey(DEFAULT_STOCK_SYMBOL)]
  }, [routeSymbol, searchParams])

  const primaryAssetKey = assetKeys[0] ?? ''
  const isMulti = assetKeys.length > 1

  const { settings } = useSettings()
  const [buyDate, setBuyDate] = useState(DEFAULT_BACKTEST_BUY_DATE)
  const [capitalReady, setCapitalReady] = useState(false)
  const [initialCapital, setInitialCapital] = useState(100000)
  const [includeFees, setIncludeFees] = useState(false)
  const [feeRate, setFeeRate] = useState(0.0003)
  const [stampDutyRate, setStampDutyRate] = useState(0.0005)
  const [minCommission, setMinCommission] = useState(5)
  const [benchmarkSymbol, setBenchmarkSymbol] = useState('')
  const [dcaEnabled, setDcaEnabled] = useState(false)
  const [dcaFrequency, setDcaFrequency] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')
  const [dcaAmount, setDcaAmount] = useState(10000)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Multi-stock results
  const [multiResults, setMultiResults] = useState<BacktestResultDto[]>([])
  const [multiLoading, setMultiLoading] = useState(false)
  const [multiError, setMultiError] = useState<string | null>(null)

  useEffect(() => {
    if (settings && !capitalReady) {
      setInitialCapital(settings.backtestInitialCapital)
      setIncludeFees(settings.backtestIncludeFees)
      setFeeRate(settings.backtestFeeRate)
      setStampDutyRate(settings.backtestStampDutyRate)
      setMinCommission(settings.backtestMinCommission)
      setBuyDate(`${settings.defaultYearRange[0]}-01-01`)
      setCapitalReady(true)
    }
  }, [settings, capitalReady])

  // Single stock mode: use existing hook
  const singleParams: BacktestParams = useMemo(() => ({
    assetKey: isMulti ? null : primaryAssetKey,
    buyDate,
    initialCapital,
    includeFees,
    feeRate,
    stampDutyRate,
    minCommission,
    benchmarkSymbol: benchmarkSymbol || undefined,
    dcaEnabled,
    dcaFrequency: dcaEnabled ? dcaFrequency : undefined,
    dcaAmount: dcaEnabled ? dcaAmount : undefined
  }), [isMulti, primaryAssetKey, buyDate, initialCapital, includeFees, feeRate, stampDutyRate, minCommission, benchmarkSymbol, dcaEnabled, dcaFrequency, dcaAmount])

  const { data: singleData, loading: singleLoading, error: singleError } = useAssetBacktest(singleParams)

  // Multi stock mode: fetch in parallel
  useEffect(() => {
    if (!isMulti) {
      setMultiResults([])
      return
    }

    let disposed = false
    setMultiLoading(true)
    setMultiError(null)

    const api = getCalculationDesktopApi()
    const dcaConfig = dcaEnabled ? { enabled: true, frequency: dcaFrequency, amount: dcaAmount } : undefined

    Promise.allSettled(
      assetKeys.map((key) =>
        api.runDividendReinvestmentBacktestForAsset({
          asset: { assetKey: key },
          buyDate,
          initialCapital,
          includeFees,
          feeRate,
          stampDutyRate,
          minCommission,
          benchmarkSymbol: benchmarkSymbol || undefined,
          dcaConfig
        })
      )
    ).then((settled) => {
      if (disposed) return
      const results: BacktestResultDto[] = []
      const errors: string[] = []
      for (const r of settled) {
        if (r.status === 'fulfilled') {
          results.push(r.value)
        } else {
          errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
        }
      }
      setMultiResults(results)
      if (errors.length > 0 && results.length === 0) {
        setMultiError(errors.join('; '))
      }
      setMultiLoading(false)
    }).catch((err) => {
      if (!disposed) {
        setMultiError(err instanceof Error ? err.message : '回测失败')
        setMultiLoading(false)
      }
    })

    return () => { disposed = true }
  }, [isMulti, assetKeys, buyDate, initialCapital, includeFees, feeRate, stampDutyRate, minCommission, benchmarkSymbol, dcaEnabled, dcaFrequency, dcaAmount])

  useEffect(() => {
    rememberLastAssetKey(primaryAssetKey)
  }, [primaryAssetKey])

  // Unified data/loading/error for rendering
  const data = isMulti ? (multiResults.length > 0 ? multiResults[0] : null) : singleData
  const loading = isMulti ? multiLoading : singleLoading
  const error = isMulti ? multiError : singleError

  return (
    <div className="ledger-page">
      <section className="ledger-watchlist-header">
        <div className="ledger-watchlist-copy">
          <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>分红复投回测</h1>
          <p className="ledger-hero-subtitle">
            {isMulti
              ? `对比 ${assetKeys.length} 只股票：${assetKeys.map((k) => k.split(':').pop()).join(', ')}`
              : '选择回测参数，系统按真实历史行情与分红事件计算复投结果。'}
          </p>
        </div>
        <div className="ledger-hero-actions">
          <input
            type="date"
            className="ledger-date-input"
            value={buyDate}
            onChange={(event) => setBuyDate(event.target.value)}
          />
          <button type="button" className="ledger-secondary-button" onClick={() => navigate(buildAssetDetailPath(primaryAssetKey))}>
            返回详情
          </button>
        </div>
      </section>

      <div className="ledger-toolbar-card">
        <div className="ledger-toolbar-head">
          <div>
            <div className="ledger-toolbar-title">回测参数</div>
            <div className="ledger-toolbar-hint">调整参数后自动重新计算</div>
          </div>
          <button
            type="button"
            className={`ledger-filter-chip ${showAdvanced ? 'is-active' : ''}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            高级选项
          </button>
        </div>

        <div className="ledger-filter-bar">
          <span className="ledger-stat-label" style={{ whiteSpace: 'nowrap' }}>初始资金</span>
          <input
            type="number"
            className="ledger-date-input"
            style={{ width: 140 }}
            min={1000} max={999999999} step={10000}
            value={initialCapital}
            onChange={(e) => setInitialCapital(parseInt(e.target.value, 10) || 100000)}
          />
          <span style={{ color: '#66707a', fontSize: 13, fontWeight: 600 }}>元/只</span>
        </div>

        <div className="ledger-filter-bar">
          <span className="ledger-stat-label">手续费</span>
          <button
            type="button"
            className={`ledger-inline-action-btn ${includeFees ? 'is-selected' : ''}`}
            style={{ height: 34, padding: '0 18px', fontSize: 13 }}
            onClick={() => setIncludeFees(!includeFees)}
          >
            {includeFees ? '已开启' : '已关闭'}
          </button>

          <span className="ledger-stat-label" style={{ marginLeft: 12 }}>基准</span>
          <select
            value={benchmarkSymbol}
            onChange={(e) => setBenchmarkSymbol(e.target.value)}
            style={{
              height: 34, padding: '0 12px', borderRadius: 999,
              border: '1px solid rgba(211,217,224,0.92)',
              background: 'rgba(243,245,247,0.92)', fontWeight: 600, fontSize: 13, color: '#3b4046'
            }}
          >
            {BENCHMARK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {showAdvanced && (
          <>
            <div className="ledger-toolbar-divider" />

            {includeFees && (
              <div className="ledger-calc-summary">
                <div className="ledger-calc-summary-item">
                  <span>佣金率</span>
                  <input
                    type="number"
                    className="ledger-date-input"
                    style={{ width: 100, marginTop: 6 }}
                    min={0} max={0.01} step={0.0001}
                    value={feeRate}
                    onChange={(e) => setFeeRate(parseFloat(e.target.value) || 0.0003)}
                  />
                </div>
                <div className="ledger-calc-summary-item">
                  <span>印花税</span>
                  <input
                    type="number"
                    className="ledger-date-input"
                    style={{ width: 100, marginTop: 6 }}
                    min={0} max={0.01} step={0.0001}
                    value={stampDutyRate}
                    onChange={(e) => setStampDutyRate(parseFloat(e.target.value) || 0.0005)}
                  />
                </div>
                <div className="ledger-calc-summary-item">
                  <span>最低佣金</span>
                  <input
                    type="number"
                    className="ledger-date-input"
                    style={{ width: 80, marginTop: 6 }}
                    min={0} max={100} step={1}
                    value={minCommission}
                    onChange={(e) => setMinCommission(parseInt(e.target.value, 10) || 5)}
                  />
                  <span style={{ marginLeft: 4, color: '#66707a', fontSize: 12, fontWeight: 600 }}>元</span>
                </div>
              </div>
            )}

            <div className="ledger-section" style={{ gap: 10 }}>
              <div className="ledger-filter-bar">
                <span className="ledger-stat-label">定投</span>
                <button
                  type="button"
                  className={`ledger-inline-action-btn ${dcaEnabled ? 'is-selected' : ''}`}
                  style={{ height: 34, padding: '0 18px', fontSize: 13 }}
                  onClick={() => setDcaEnabled(!dcaEnabled)}
                >
                  {dcaEnabled ? '已开启' : '已关闭'}
                </button>
              </div>

              {dcaEnabled && (
                <div className="ledger-filter-bar">
                  <select
                    value={dcaFrequency}
                    onChange={(e) => setDcaFrequency(e.target.value as 'monthly' | 'quarterly' | 'yearly')}
                    style={{
                      height: 34, padding: '0 12px', borderRadius: 999,
                      border: '1px solid rgba(211,217,224,0.92)',
                      background: 'rgba(243,245,247,0.92)', fontWeight: 600, fontSize: 13, color: '#3b4046'
                    }}
                  >
                    <option value="monthly">每月</option>
                    <option value="quarterly">每季度</option>
                    <option value="yearly">每年</option>
                  </select>
                  <input
                    type="number"
                    className="ledger-date-input"
                    style={{ width: 140 }}
                    min={100} step={1000}
                    value={dcaAmount}
                    onChange={(e) => setDcaAmount(parseInt(e.target.value, 10) || 10000)}
                  />
                  <span style={{ color: '#66707a', fontSize: 13, fontWeight: 600 }}>元/次</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {loading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {!loading && error ? <Alert type="error" message={error} /> : null}
      {!loading && !error && !primaryAssetKey.trim() ? (
        <PageStateBlock
          kind="empty"
          title="还没有选择回测标的"
          description="请先进入某个资产详情页，再发起回测。"
        />
      ) : null}
      {!loading && !error && primaryAssetKey.trim() && !data ? (
        <PageStateBlock
          kind="no-data"
          title="当前条件暂无回测结果"
          description="系统未返回可展示的回测数据，请调整条件后重试。"
        />
      ) : null}

      {/* Multi compare */}
      {!loading && !error && isMulti && multiResults.length >= 2 ? (
        <BacktestMultiCompare results={multiResults} />
      ) : null}

      {/* Individual results */}
      {!loading && !error && isMulti && multiResults.length > 0 ? (
        multiResults.map((r) => (
          <div key={r.symbol} style={{ marginTop: 16 }}>
            <BacktestSummaryCard result={r} />
            <BacktestNavChart result={r} />
          </div>
        ))
      ) : null}

      {/* Single result */}
      {!loading && !error && !isMulti && data && data.transactions.length === 0 ? (
        <PageStateBlock
          kind="no-data"
          title="当前区间暂无可回测流水"
          description="该股票在所选买入日期后缺少交易或分红事件，暂无法生成流水。"
        />
      ) : null}
      {!loading && !error && !isMulti && data && data.transactions.length > 0 ? (
        <>
          <div className="ledger-hero-actions" style={{ marginBottom: 16 }}>
            <button
              type="button"
              className="ledger-primary-button"
              onClick={async () => {
                try {
                  const api = getBacktestDesktopApi()
                  await api.historySave(data, undefined, undefined)
                  void message.success('回测结果已保存')
                } catch {
                  void message.error('保存失败')
                }
              }}
            >
              保存结果
            </button>
            <button
              type="button"
              className="ledger-secondary-button"
              onClick={() => navigate('/backtest-history')}
            >
              历史记录
            </button>
          </div>
          <BacktestSummaryCard result={data} />
          <BacktestNavChart result={data} />
        </>
      ) : null}
    </div>
  )
}
