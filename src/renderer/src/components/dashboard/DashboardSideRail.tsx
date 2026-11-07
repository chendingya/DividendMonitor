import type { PortfolioRiskMetricsDto } from '@shared/contracts/api'
import { PortfolioDistributionPie, type DistributionSlice } from '@renderer/components/dashboard/PortfolioDistributionPie'
import { maskAmount } from '@renderer/utils/amountPrivacy'

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

type DashboardSideRailProps = {
  slices: DistributionSlice[]
  riskMetrics: PortfolioRiskMetricsDto | null
  hideAmounts: boolean
}

export function DashboardSideRail({ slices, riskMetrics, hideAmounts }: DashboardSideRailProps) {
  const display = (text: string) => (hideAmounts ? maskAmount(text) : text)
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const riskRows = [
    { label: '年化波动率', value: riskMetrics?.portfolioVolatility != null ? percent.format(riskMetrics.portfolioVolatility) : '--' },
    { label: '夏普比率', value: riskMetrics?.portfolioSharpeRatio != null ? riskMetrics.portfolioSharpeRatio.toFixed(2) : '--' },
    { label: '最大回撤', value: riskMetrics?.maxDrawdown != null ? percent.format(riskMetrics.maxDrawdown) : '--' }
  ]

  return (
    <aside className="dashboard-side-rail">
      <section className="ledger-toolbar-card" aria-label="资产配置">
        <div className="ledger-section-head">
          <h2>资产配置</h2>
        </div>
        {slices.length === 0 ? (
          <p className="ledger-transaction-hint">暂无市值数据，刷新估值后展示按资产类型的配置。</p>
        ) : (
          <>
            <PortfolioDistributionPie items={slices} height={200} hideAmounts={hideAmounts} />
            <ul className="dashboard-allocation-legend">
              {slices.map((slice) => (
                <li key={slice.name}>
                  <span className="dashboard-allocation-dot" style={{ background: slice.color }} />
                  <span>{slice.name}</span>
                  <strong>{display(currency.format(slice.value))}</strong>
                  <small>{total > 0 ? `${((slice.value / total) * 100).toFixed(0)}%` : '--'}</small>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="ledger-toolbar-card" aria-label="风险指标">
        <div className="ledger-section-head">
          <h2>风险指标</h2>
        </div>
        <dl className="dashboard-risk-rows">
          {riskRows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{display(row.value)}</dd>
            </div>
          ))}
        </dl>
        <p className="ledger-transaction-hint">基于持仓权重与共同交易日序列计算，至少需要两个持仓。</p>
      </section>
    </aside>
  )
}
