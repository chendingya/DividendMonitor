import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import { AssetAvatar } from '@renderer/components/app/AssetAvatar'
import type { PortfolioOpportunity } from '@renderer/hooks/usePortfolio'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

type DashboardOpportunitiesProps = {
  opportunities: PortfolioOpportunity[]
  onGoToDetail: (row: PortfolioOpportunity) => void
}

export function DashboardOpportunities({ opportunities, onGoToDetail }: DashboardOpportunitiesProps) {
  return (
    <section className="ledger-section">
      <div className="ledger-section-head">
        <h2>高收益机会（来自当前持仓）</h2>
      </div>
      {opportunities.length === 0 ? (
        <PageStateBlock kind="no-data" title="暂无可计算机会" description="当前持仓中暂无可用的收益指标数据。" />
      ) : (
        <div className="ledger-opportunity-grid">
          {opportunities.map((item) => (
            <button
              key={item.assetKey ?? item.id}
              type="button"
              className="ledger-link-button"
              onClick={() => onGoToDetail(item)}
            >
              <section className="ledger-opportunity-card">
                <div className="ledger-opportunity-head">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <AssetAvatar name={item.name} assetType={item.assetType ?? 'STOCK'} size={28} />
                  </div>
                  <div className="ledger-opportunity-value">
                    <strong>{percent.format(item.yieldMetric)}</strong>
                    <span>{item.yieldLabel}</span>
                  </div>
                </div>
                <div className="ledger-opportunity-title">{item.name}</div>
                <div className="ledger-opportunity-subtitle">{`${item.assetType ?? '资产'} · 持仓候选`}</div>
              </section>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
