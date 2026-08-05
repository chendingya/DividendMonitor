import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import { useHousingCities } from '@renderer/hooks/useHousing'

export function HousingYieldCard() {
  const navigate = useNavigate()
  const { data, loading, error } = useHousingCities()

  const watched = useMemo(() => (data ?? []).filter((item) => item.isWatched), [data])

  const best = useMemo(() => {
    if (watched.length === 0) return null
    return [...watched].sort(
      (a, b) => (b.rentalYieldPercent ?? -1) - (a.rentalYieldPercent ?? -1)
    )[0]
  }, [watched])

  if (loading) return null

  if (error || watched.length === 0) {
    return (
      <section className="ledger-section">
        <div className="ledger-section-head">
          <h2>房产收息</h2>
        </div>
        <div className="ledger-list-card">
          <PageStateBlock
            kind="empty"
            title="暂无关注城市"
            description="在「房产」页关注城市后，这里会展示其租金收益率。"
          />
        </div>
      </section>
    )
  }

  return (
    <section className="ledger-section">
      <div className="ledger-section-head">
        <h2>房产收息</h2>
      </div>
      <div className="ledger-list-card">
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(171, 173, 175, 0.12)' }}>
          <div style={{ fontSize: 12, color: '#8b949e' }}>最佳租金收益率</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#1a7f37', marginTop: 4 }}>
            {best?.rentalYieldPercent == null ? '--' : `${best.rentalYieldPercent.toFixed(2)}%`}
          </div>
          <button
            type="button"
            className="ledger-link-button"
            style={{ padding: 0, marginTop: 4 }}
            onClick={() => navigate(`/housing/${encodeURIComponent(best?.city ?? '')}`)}
          >
            {best?.city ?? ''}（租售比 {best?.priceToRentRatio?.toFixed(1) ?? '--'} 年）
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '12px 16px' }}>
          {watched.slice(0, 6).map((item) => (
            <button
              key={item.city}
              type="button"
              className="ledger-link-button"
              style={{ padding: 0, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
              onClick={() => navigate(`/housing/${encodeURIComponent(item.city)}`)}
            >
              <span>{item.city}</span>
              <span style={{ color: '#57606a' }}>
                {item.rentalYieldPercent == null ? '暂无' : `${item.rentalYieldPercent.toFixed(2)}%`}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
