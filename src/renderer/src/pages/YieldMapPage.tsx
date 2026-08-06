import { message as antdMessage } from 'antd'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageState } from '@renderer/components/app/PageState'
import { YieldMapTreemap } from '@renderer/components/yield-map/YieldMapTreemap'
import { useFetch } from '@renderer/hooks/useFetch'
import { yieldMapApi } from '@renderer/services/yieldMapApi'
import { buildStockDetailPath } from '@renderer/services/routeContext'
import { formatUpdatedAtLabel } from '@renderer/utils/format'

const LEGEND = [
  { color: '#b31b25', label: '股息率 ≥7%' },
  { color: '#e8773e', label: '股息率 5%~7%' },
  { color: '#f0b429', label: '股息率 3.5%~5%' },
  { color: '#2ea86b', label: '股息率 2%~3.5%' },
  { color: '#6ba3d6', label: '股息率 <2%' },
  { color: '#8b949e', label: '无分红' }
]

export function YieldMapPage() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFetch(
    () => yieldMapApi.get(),
    [],
    { rethrow: false }
  )

  const handleRefresh = useCallback(async () => {
    antdMessage.loading({ content: '正在抓取全市场数据…', key: 'yield-map-refresh' })
    try {
      await yieldMapApi.refresh()
      await reload()
      antdMessage.success({ content: '股息率地图已更新', key: 'yield-map-refresh' })
    } catch (err) {
      antdMessage.error({ content: err instanceof Error ? err.message : '刷新失败', key: 'yield-map-refresh' })
    }
  }, [reload])

  const handleSelectStock = useCallback(
    (symbol: string) => navigate(buildStockDetailPath(symbol)),
    [navigate]
  )

  return (
    <PageState loading={loading} error={error} skeletonRows={12}>
      <div className="ledger-page">
        <section className="ledger-watchlist-header">
          <div className="ledger-watchlist-copy">
            <h1 className="ledger-hero-title" style={{ fontSize: 34 }}>股息率地图</h1>
            <p className="ledger-hero-subtitle">
              全市场 A 股股息率（TTM）行业分布，颜色越深股息率越高，点击色块直达个股详情。
            </p>
          </div>
          <div className="ledger-hero-actions">
            <button type="button" className="ledger-secondary-button" onClick={() => void handleRefresh()}>
              刷新数据
            </button>
          </div>
        </section>

        {data && (
          <>
            <section className="ledger-toolbar-card">
              <div className="ledger-filter-bar" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {LEGEND.map((item) => (
                  <span className="pill" key={item.label}>
                    <span
                      style={{ width: 10, height: 10, borderRadius: 999, background: item.color, display: 'inline-block' }}
                    />
                    {item.label}
                  </span>
                ))}
                <span style={{ marginLeft: 'auto', color: 'var(--text-soft)', fontSize: 12 }}>
                  {data.stockCount > 0
                    ? `全市场 ${data.stockCount} 只 · ${formatUpdatedAtLabel(data.fetchedAt) ?? '暂无数据'}`
                    : data.industries.length > 0
                      ? `云端行业快照 · ${formatUpdatedAtLabel(data.fetchedAt) ?? '未知时间'}（等待本地刷新）`
                      : '暂无数据'}
                </span>
              </div>
            </section>

            <section className="ledger-toolbar-card">
              <div className="ledger-toolbar-head">
                <div>
                  <div className="ledger-toolbar-title">按行业分布</div>
                  <div className="ledger-toolbar-hint">块大小=样本数，颜色=中位数股息率</div>
                </div>
              </div>
              <YieldMapTreemap
                industries={data.industries}
                stocks={data.stocks}
                onSelectStock={handleSelectStock}
              />
            </section>
          </>
        )}
      </div>
    </PageState>
  )
}

export default YieldMapPage
