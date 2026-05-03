import { Alert, Col, Divider, Progress, Row, Skeleton, Space, Table, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppCard } from '@renderer/components/app/AppCard'
import { AssetAvatar } from '@renderer/components/app/AssetAvatar'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import { FutureYieldEstimateCard } from '@renderer/components/stock-detail/FutureYieldEstimateCard'
import { IndexValuationCard } from '@renderer/components/stock-detail/IndexValuationCard'
import { IndexValuationTrendChart } from '@renderer/components/stock-detail/IndexValuationTrendChart'
import { ValuationTrendChart } from '@renderer/components/stock-detail/ValuationTrendChart'
import { YearlyDividendTrendChart } from '@renderer/components/stock-detail/YearlyDividendTrendChart'
import { DEFAULT_STOCK_SYMBOL } from '@renderer/defaults'
import { useAssetDetail } from '@renderer/hooks/useAssetDetail'
import { useWatchlist } from '@renderer/hooks/useWatchlist'
import { useIndustryBenchmark } from '@renderer/hooks/useIndustryAnalysis'
import { buildStockAssetKey, createStockAssetQuery } from '@shared/contracts/api'
import {
  buildBacktestPathFromAssetKey,
  getRememberedLastAssetKey,
  getRememberedLastSymbol,
  parseAssetKeyFromSearch,
  parseSymbolFromSearch,
  rememberLastAssetKey,
  rememberLastSymbol,
  rememberRecentAssetKey,
  rememberRecentSymbol
} from '@renderer/services/routeContext'

function formatRatioValue(value?: number) {
  return value == null ? '--' : value.toFixed(2)
}

export function StockDetailPage() {
  const navigate = useNavigate()
  const [apiMessage, messageHolder] = message.useMessage()
  const { symbol: routeSymbol } = useParams<{ symbol?: string }>()
  const [searchParams] = useSearchParams()
  const assetQuery = useMemo(() => {
    const assetKey = parseAssetKeyFromSearch(searchParams)
    if (assetKey) {
      return { assetKey }
    }

    const bySearch = parseSymbolFromSearch(searchParams)
    if (bySearch) {
      return createStockAssetQuery(bySearch)
    }
    if (routeSymbol) {
      return createStockAssetQuery(routeSymbol)
    }
    const rememberedAssetKey = getRememberedLastAssetKey()
    if (rememberedAssetKey) {
      return { assetKey: rememberedAssetKey }
    }
    return createStockAssetQuery(getRememberedLastSymbol() ?? DEFAULT_STOCK_SYMBOL)
  }, [routeSymbol, searchParams])
  const assetKey = assetQuery.assetKey ?? buildStockAssetKey(assetQuery.code ?? assetQuery.symbol ?? DEFAULT_STOCK_SYMBOL)
  const { data, loading, error } = useAssetDetail(assetQuery)
  const { data: watchlistItems, addAsset, removeAsset, mutatingAssetKey } = useWatchlist()
  const [showAllYearlyYields, setShowAllYearlyYields] = useState(false)
  const [valuationWindow, setValuationWindow] = useState<'10Y' | '20Y'>('10Y')
  const isInWatchlist = useMemo(() => watchlistItems.some((item) => item.assetKey === assetKey), [assetKey, watchlistItems])
  const industryBenchmark = useIndustryBenchmark(data?.industry)

  useEffect(() => {
    rememberLastAssetKey(assetKey)
    rememberRecentAssetKey(assetKey)
    if (data?.assetType === 'STOCK' && data.symbol) {
      rememberLastSymbol(data.symbol)
      rememberRecentSymbol(data.symbol)
    }
  }, [assetKey, data])

  function goToBacktest() {
    navigate(buildBacktestPathFromAssetKey(assetKey))
  }

  async function toggleWatchlist() {
    if (!assetKey.trim()) {
      return
    }

    try {
      if (isInWatchlist) {
        await removeAsset(assetKey)
        apiMessage.success('已将该资产移出自选')
        return
      }

      await addAsset({ assetKey })
      apiMessage.success('已将该资产加入自选')
    } catch (actionError) {
      apiMessage.error(actionError instanceof Error ? actionError.message : '更新自选失败')
    }
  }

  if (loading) {
    return <Skeleton active paragraph={{ rows: 8 }} />
  }

  if (error) {
    return <Alert type="error" message={error} />
  }

  if (!assetKey.trim()) {
    return (
      <PageStateBlock
        kind="empty"
        title="还没有选择资产"
        description="请先从概览页或自选页进入资产详情。"
      />
    )
  }

  if (!data) {
    return (
      <PageStateBlock
        kind="no-data"
        title="该资产暂无详情数据"
        description="当前未返回可展示的详情信息，可稍后重试或更换资产代码。"
      />
    )
  }

  if (data.yearlyYields.length === 0 && data.dividendEvents.length === 0) {
    return (
      <PageStateBlock
        kind="no-data"
        title="该资产暂无历史现金分配数据"
        description="已获取到基础信息，但没有可用于计算收益率的历史记录。"
      />
    )
  }

  const latestYear = data.yearlyYields[data.yearlyYields.length - 1]
  const averageYield =
    data.yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(data.yearlyYields.length, 1)
  const sortedDividendEvents = [...data.dividendEvents].sort((a, b) => {
    const dateA = a.exDate ?? a.payDate ?? a.recordDate ?? `${a.year}-01-01`
    const dateB = b.exDate ?? b.payDate ?? b.recordDate ?? `${b.year}-01-01`
    return dateB.localeCompare(dateA)
  })
  const sortedYearlyYields = [...data.yearlyYields].sort((a, b) => b.year - a.year)
  const visibleYearlyYields = showAllYearlyYields ? sortedYearlyYields : sortedYearlyYields.slice(0, 12)
  const peWindow = data.valuation?.pe?.windows.find((item) => item.window === valuationWindow)
  const pbWindow = data.valuation?.pb?.windows.find((item) => item.window === valuationWindow)
  const displayCode = data.symbol ?? data.code
  const displayName = data.name?.trim() || displayCode
  const caps = data.capabilities
  const hasValuation = caps.hasValuationAnalysis && (data.peRatio != null || data.pbRatio != null || data.valuation != null)
  const hasIndexValuation = data.modules.indexValuation != null
  const hasFundProfile =
    !caps.hasValuationAnalysis &&
    Boolean(data.category || data.manager || data.trackingIndex || data.benchmark || data.latestNav != null || data.fundScale != null)

  function formatFundScale(value?: number) {
    if (value == null) {
      return '--'
    }
    if (value >= 100_000_000) {
      return `${(value / 100_000_000).toFixed(2)} 亿`
    }
    if (value >= 10_000) {
      return `${(value / 10_000).toFixed(2)} 万`
    }
    return value.toFixed(2)
  }

  return (
    <div className="ledger-page">
      {messageHolder}
      <section className="ledger-detail-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
            <AssetAvatar name={data.name} assetType={data.assetType} size={40} />
            <div>
              <div className="ledger-detail-tags">
                <span className="pill">{data.industry ?? data.category ?? '未分类'}</span>
                <span className="pill primary">{displayCode}</span>
                <span className="pill">{data.assetType}</span>
              </div>
              <h1 className="ledger-detail-title">{displayName}</h1>
            </div>
          </div>
        </div>
        <div>
          <div className="ledger-detail-price">
            <strong>{data.latestPrice.toFixed(2)}</strong>
            <span>{data.latestNav != null ? `最新价 / 净值 ${data.latestNav.toFixed(4)}` : `最新价 / ${data.assetType}`}</span>
          </div>
          <div className="ledger-hero-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="ledger-secondary-button"
              onClick={toggleWatchlist}
              disabled={mutatingAssetKey === assetKey}
            >
              {mutatingAssetKey === assetKey ? '处理中...' : isInWatchlist ? '移出自选' : '加入自选'}
            </button>
            <button type="button" className="ledger-primary-button" onClick={goToBacktest}>
              进入回测
            </button>
          </div>
        </div>
      </section>

      <Row gutter={[18, 18]}>
        <Col xs={24} md={12} xl={6}>
          <AppCard className="ledger-detail-stat">
            <div className="ledger-stat-label">股息率</div>
            <div className="ledger-stat-value">{latestYear ? `${(latestYear.yield * 100).toFixed(2)}%` : '--'}</div>
            <div className="ledger-stat-hint">最近自然年</div>
          </AppCard>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <AppCard className="ledger-detail-stat">
            <div className="ledger-stat-label">最近现金分配</div>
            <div className="ledger-stat-value">
              {data.dividendEvents.length > 0
                ? data.dividendEvents[data.dividendEvents.length - 1].dividendPerShare.toFixed(2)
                : '--'}
            </div>
            <div className="ledger-stat-hint">最近一次每股现金分红</div>
          </AppCard>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <AppCard className="ledger-detail-stat">
            <div className="ledger-stat-label">平均收益率</div>
            <div className="ledger-stat-value">{`${(averageYield * 100).toFixed(2)}%`}</div>
            <Progress
              percent={Number(Math.min(100, averageYield * 1200).toFixed(2))}
              showInfo={false}
              strokeColor="#0052d0"
              trailColor="rgba(217,221,224,0.65)"
              style={{ marginTop: 10 }}
            />
          </AppCard>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <AppCard className="ledger-detail-stat">
            <div className="ledger-stat-label">未来收益估算</div>
            <div className="ledger-stat-value" style={{ color: '#0052d0' }}>
              {data.futureYieldEstimate.isAvailable
                ? `${(data.futureYieldEstimate.estimatedFutureYield * 100).toFixed(2)}%`
                : '--'}
            </div>
            <div className="ledger-stat-hint">{data.futureYieldEstimate.reason ?? '基准未来股息率估算'}</div>
          </AppCard>
        </Col>
      </Row>
      <Row gutter={[18, 18]} style={{ marginTop: 18 }}>
        <Col xs={24} md={12} xl={8}>
          <AppCard className="ledger-detail-stat">
            <div className="ledger-stat-label">年化波动率</div>
            <div className="ledger-stat-value">
              {data.annualVolatility != null ? `${(data.annualVolatility * 100).toFixed(1)}%` : '--'}
            </div>
            <div className="ledger-stat-hint">日收益标准差年化（252 交易日）</div>
          </AppCard>
        </Col>
        <Col xs={24} md={12} xl={8}>
          <AppCard className="ledger-detail-stat">
            <div className="ledger-stat-label">夏普比率</div>
            <div className="ledger-stat-value" style={{ color: '#0052d0' }}>
              {data.sharpeRatio != null ? data.sharpeRatio.toFixed(2) : '--'}
            </div>
            <div className="ledger-stat-hint">（年化收益 - 无风险利率 2.5%）/ 年化波动率</div>
          </AppCard>
        </Col>
      </Row>

      {hasFundProfile ? (
        <AppCard title="基金画像">
          <div className="ledger-valuation-grid">
            <div className="ledger-valuation-card">
              <div className="ledger-stat-label">基金类型</div>
              <div className="ledger-valuation-primary">{data.category ?? '--'}</div>
              <div className="ledger-valuation-status">管理人：{data.manager ?? '--'}</div>
            </div>
            <div className="ledger-valuation-card">
              <div className="ledger-stat-label">跟踪标的</div>
              <div className="ledger-valuation-primary">{data.trackingIndex ?? '--'}</div>
              <div className="ledger-valuation-status">业绩基准：{data.benchmark ?? '--'}</div>
            </div>
            <div className="ledger-valuation-card">
              <div className="ledger-stat-label">基金规模</div>
              <div className="ledger-valuation-primary">{formatFundScale(data.fundScale)}</div>
              <div className="ledger-valuation-status">最新净值：{data.latestNav != null ? data.latestNav.toFixed(4) : '--'}</div>
            </div>
          </div>
        </AppCard>
      ) : null}

      {hasValuation ? (
        <AppCard
          title="估值水平"
          extra={
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
          }
        >
          <div className="ledger-valuation-grid">
            <div className="ledger-valuation-card">
              <div className="ledger-valuation-head">
                <div>
                  <div className="ledger-stat-label">市盈率 PE(TTM)</div>
                  <div className="ledger-valuation-primary">{formatRatioValue(data.peRatio)}</div>
                  {industryBenchmark && (
                    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
                      行业均值 {industryBenchmark.avgPeRatio > 0 ? industryBenchmark.avgPeRatio.toFixed(1) : '--'}
                      <span style={{ marginLeft: 4, fontSize: 11 }}>
                        (共 {industryBenchmark.stockCount} 只)
                      </span>
                    </div>
                  )}
                </div>
                <span className="pill primary">{peWindow?.percentile == null ? '--' : `${peWindow.percentile.toFixed(2)}%`}</span>
              </div>
              <div className="ledger-valuation-status">{data.valuation?.pe?.status ?? '暂无分位状态'}</div>
              <div className="ledger-valuation-band">
                <span>30分位 {formatRatioValue(peWindow?.p30)}</span>
                <span>50分位 {formatRatioValue(peWindow?.p50)}</span>
                <span>70分位 {formatRatioValue(peWindow?.p70)}</span>
              </div>
            </div>
            <div className="ledger-valuation-card">
              <div className="ledger-valuation-head">
                <div>
                  <div className="ledger-stat-label">市净率 PB(MRQ)</div>
                  <div className="ledger-valuation-primary">{formatRatioValue(data.pbRatio)}</div>
                  {industryBenchmark && (
                    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
                      行业均值 --
                    </div>
                  )}
                </div>
                <span className="pill primary">{pbWindow?.percentile == null ? '--' : `${pbWindow.percentile.toFixed(2)}%`}</span>
              </div>
              <div className="ledger-valuation-status">{data.valuation?.pb?.status ?? '暂无分位状态'}</div>
              <div className="ledger-valuation-band">
                <span>30分位 {formatRatioValue(pbWindow?.p30)}</span>
                <span>50分位 {formatRatioValue(pbWindow?.p50)}</span>
                <span>70分位 {formatRatioValue(pbWindow?.p70)}</span>
              </div>
            </div>
            <div className="ledger-valuation-card">
              <div className="ledger-valuation-head">
                <div>
                  <div className="ledger-stat-label">净资产收益率 ROE</div>
                  <div className="ledger-valuation-primary">{data.roe != null ? `${data.roe.toFixed(2)}%` : '--'}</div>
                  {industryBenchmark && (
                    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
                      行业均值 {industryBenchmark.avgRoe > 0 ? `${industryBenchmark.avgRoe.toFixed(1)}%` : '--'}
                    </div>
                  )}
                </div>
              </div>
              <div className="ledger-valuation-status">加权净资产收益率（归属于母公司股东）</div>
            </div>
          </div>
          <Typography.Paragraph style={{ margin: '14px 0 0', color: '#66707a' }}>
            分位按所选时间窗内的历史估值序列计算，数值越低通常代表当前估值在历史区间中越靠下。
          </Typography.Paragraph>
        </AppCard>
      ) : null}

      {hasIndexValuation ? (
        <div style={{ marginTop: 18 }}>
          <IndexValuationCard
            indexValuation={data.modules.indexValuation!}
            valuationWindow={valuationWindow}
          />
        </div>
      ) : null}

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={16}>
          <AppCard
            title="历史收益率（自然年）"
            extra={
              sortedYearlyYields.length > 12 ? (
                <button
                  type="button"
                  className="ledger-link-button"
                  onClick={() => setShowAllYearlyYields((current) => !current)}
                >
                  {showAllYearlyYields ? '收起到 12 条' : '展开全部'}
                </button>
              ) : null
            }
          >
            <div className="ledger-yield-chart">
              <div className="ledger-yield-axis">
                {visibleYearlyYields.map((item) => (
                  <div key={item.year} className="ledger-yield-row">
                    <div className="ledger-yield-year">{item.year}</div>
                    <div className="ledger-yield-track">
                      <div
                        className="ledger-yield-bar"
                        style={{ width: `${Math.max(8, Math.min(100, item.yield * 1600))}%` }}
                      />
                    </div>
                    <div className="ledger-yield-value">{(item.yield * 100).toFixed(2)}%</div>
                  </div>
                ))}
              </div>
            </div>
            {sortedYearlyYields.length > 12 ? (
              <Typography.Paragraph style={{ margin: '12px 0 0', color: '#8b949e' }}>
                默认展示最近 12 年，点击“展开全部”查看完整历史。
              </Typography.Paragraph>
            ) : null}
          </AppCard>
        </Col>
        <Col xs={24} xl={8}>
          <FutureYieldEstimateCard estimate={data.futureYieldEstimate} />
        </Col>
      </Row>

      <YearlyDividendTrendChart items={data.yearlyYields} />

      {hasValuation ? <ValuationTrendChart detail={data} valuationWindow={valuationWindow} /> : null}

      {hasIndexValuation && data.modules.indexValuation!.hasHistory ? (
        <IndexValuationTrendChart
          indexValuation={data.modules.indexValuation!}
          valuationWindow={valuationWindow}
        />
      ) : null}

      <AppCard title="现金分配历史（最近在上）">
        <Table
          className="soft-table"
          rowKey={(record) => `${record.exDate ?? record.year}-${record.dividendPerShare}`}
          pagination={{
            pageSize: 10,
            hideOnSinglePage: true,
            showSizeChanger: false
          }}
          dataSource={sortedDividendEvents}
          columns={[
            { title: '自然年', dataIndex: 'year', width: 92 },
            { title: '除息日', dataIndex: 'exDate' },
            { title: '派息日', dataIndex: 'payDate' },
            {
              title: '金额',
              dataIndex: 'dividendPerShare',
              render: (value: number) => value.toFixed(2)
            },
            {
              title: '类型',
              render: () => <span className="pill">常规</span>
            },
            {
              title: '单次股息率',
              render: (_, record) => {
                const eventYield =
                  record.referenceClosePrice > 0 ? record.dividendPerShare / record.referenceClosePrice : undefined
                return eventYield == null ? '--' : `${(eventYield * 100).toFixed(2)}%`
              }
            }
          ]}
        />
        <Divider style={{ margin: '18px 0' }} />
        <Typography.Paragraph style={{ margin: 0, color: '#66707a' }}>
          最近年份会排在最上面，每页展示 10 条。收益率按除权除息日所属自然年归集，并以事件级收益率逐次累加。
        </Typography.Paragraph>
      </AppCard>

      <AppCard title="数据口径">
        <Space direction="vertical" size={12}>
          <span className="pill primary">数据源: {data.dataSource}</span>
          <Typography.Paragraph style={{ margin: 0, color: '#66707a' }}>{data.yieldBasis}</Typography.Paragraph>
        </Space>
      </AppCard>
    </div>
  )
}
