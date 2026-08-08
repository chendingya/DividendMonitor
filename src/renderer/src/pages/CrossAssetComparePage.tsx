import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageState } from '@renderer/components/app/PageState'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import { CrossAssetScatterChart } from '@renderer/components/cross-asset/CrossAssetScatterChart'
import { CrossAssetTable } from '@renderer/components/cross-asset/CrossAssetTable'
import { useFetch } from '@renderer/hooks/useFetch'
import { crossAssetApi } from '@renderer/services/crossAssetApi'
import type { CrossAssetComparisonDto, CrossAssetPointDto } from '@shared/contracts/api'

type FilterKind = 'all' | 'stock' | 'housing'

const FILTERS: Array<{ key: FilterKind; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'stock', label: '仅股票' },
  { key: 'housing', label: '仅房产' }
]

export function CrossAssetComparePage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterKind>('all')
  const { data, loading, error } = useFetch<CrossAssetComparisonDto>(
    () => crossAssetApi.getComparison(),
    []
  )

  const filteredPoints = useMemo(() => {
    const points = data?.points ?? []
    if (filter === 'all') return points
    return points.filter((point) => point.kind === filter)
  }, [data, filter])

  function goToDetail(point: CrossAssetPointDto) {
    if (point.detailPath) {
      navigate(point.detailPath)
    }
  }

  return (
    <PageState loading={loading} error={error}>
      {!data || data.points.length === 0 ? (
        <PageStateBlock
          kind="empty"
          title="还没有可对比的标的"
          description="请先在「自选」页添加股票/ETF/基金，或在「房产」页关注城市，再回到这里查看跨资产收益对比。"
        />
      ) : (
        <div className="page-section">
          <section className="page-hero cross-asset-hero">
            <div className="hero-eyebrow">跨资产分析</div>
            <h1 className="hero-title">跨资产收益对比</h1>
            <p className="hero-subtitle">
              把股息率与租金收益率放进同一个风险收益坐标系：X 轴是年化波动率，Y 轴是收益率，越靠左上越“低风险高收益”。
            </p>
            <div className="comparison-hero-summary">
              <span className="pill primary">股票 {data.stockCount} 只</span>
              <span className="pill">房产 {data.housingCount} 城</span>
              <span className="pill">无风险利率参考线 {data.riskFreeRatePercent.toFixed(1)}%</span>
            </div>
            <div className="hero-actions">
              <div className="ledger-segmented-control">
                {FILTERS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`ledger-filter-chip ${filter === item.key ? 'is-active' : ''}`}
                    onClick={() => setFilter(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button type="button" className="ledger-secondary-button" onClick={() => navigate('/watchlist')}>
                管理自选
              </button>
            </div>
          </section>

          <section className="ledger-section">
            <div className="ledger-section-head">
              <h2>风险收益散点图</h2>
            </div>
            <div className="ledger-list-card" style={{ padding: 12 }}>
              <CrossAssetScatterChart
                points={filteredPoints}
                riskFreeRatePercent={data.riskFreeRatePercent}
                onSelect={goToDetail}
              />
              <div style={{ display: 'flex', gap: 16, padding: '0 8px 8px', color: '#57606a', fontSize: 12 }}>
                <span><span className="cross-asset-kind-dot is-stock" /> 股票/ETF/基金（股息率）</span>
                <span><span className="cross-asset-kind-dot is-housing" /> 房产（租金收益率）</span>
              </div>
            </div>
          </section>

          <section className="ledger-section">
            <div className="ledger-section-head">
              <h2>明细列表</h2>
              <span className="ledger-section-sub">{filteredPoints.length} 项</span>
            </div>
            <div className="ledger-list-card">
              <CrossAssetTable points={filteredPoints} onSelect={goToDetail} />
            </div>
          </section>
        </div>
      )}
    </PageState>
  )
}
