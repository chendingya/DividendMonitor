import { MetricPanel } from '@renderer/components/app/LedgerUi'
import type { PortfolioRiskMetricsDto } from '@shared/contracts/api'

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2
})

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

type DashboardMetricCardsProps = {
  totalReturn: number
  totalCost: number
  totalValue: number
  avgYieldMetric: number | undefined | null
  rowCount: number
  riskMetrics?: PortfolioRiskMetricsDto | null
}

export function DashboardMetricCards({
  totalReturn,
  totalCost,
  totalValue,
  avgYieldMetric,
  rowCount,
  riskMetrics
}: DashboardMetricCardsProps) {
  const hasRisk =
    riskMetrics &&
    (riskMetrics.portfolioVolatility != null ||
      riskMetrics.portfolioSharpeRatio != null ||
      riskMetrics.maxDrawdown != null)

  return (
    <>
      <section className="ledger-metric-grid">
        <MetricPanel
          label="投资组合总收益率"
          value={rowCount === 0 ? '--' : percent.format(totalReturn)}
          hint="按持仓市值 / 持仓成本计算"
          primary
          accent={<span>{rowCount} 个持仓</span>}
        />
        <MetricPanel
          label="总市值"
          value={rowCount === 0 ? '--' : currency.format(totalValue)}
          hint={`总成本 ${currency.format(totalCost)}`}
        />
        <MetricPanel
          label="平均收益指标"
          value={avgYieldMetric == null ? '--' : percent.format(avgYieldMetric)}
          hint="股票优先用未来股息率，基金回落到历史分配收益率"
        />
      </section>
      {hasRisk ? (
        <section className="ledger-metric-grid">
          <MetricPanel
            label="组合年化波动率"
            value={
              riskMetrics!.portfolioVolatility != null
                ? percent.format(riskMetrics!.portfolioVolatility)
                : '--'
            }
            hint="按持仓权重加权计算，基于对齐后共同交易日序列"
          />
          <MetricPanel
            label="组合夏普比率"
            value={
              riskMetrics!.portfolioSharpeRatio != null
                ? riskMetrics!.portfolioSharpeRatio.toFixed(2)
                : '--'
            }
            hint="标准公式 (Rp − Rf) / σp，Rf 取中国 10 年期国债收益率近似值 2.5%"
          />
          <MetricPanel
            label="最大回撤"
            value={
              riskMetrics!.maxDrawdown != null
                ? percent.format(riskMetrics!.maxDrawdown)
                : '--'
            }
            hint="组合日收益序列累计净值的历史最大回撤"
          />
        </section>
      ) : null}
    </>
  )
}
