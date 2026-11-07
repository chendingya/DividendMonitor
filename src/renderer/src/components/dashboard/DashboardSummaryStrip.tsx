import type { SummaryCell } from '@renderer/pages/dashboardSummary'
import { maskAmount } from '@renderer/utils/amountPrivacy'

type DashboardSummaryStripProps = {
  cells: SummaryCell[]
  hideAmounts: boolean
  onToggleHideAmounts: () => void
}

export function DashboardSummaryStrip({ cells, hideAmounts, onToggleHideAmounts }: DashboardSummaryStripProps) {
  const display = (text: string) => (hideAmounts ? maskAmount(text) : text)
  return (
    <section className="dashboard-summary-strip" aria-label="投资组合摘要">
      <button
        type="button"
        className="dashboard-amount-toggle"
        aria-pressed={hideAmounts}
        onClick={onToggleHideAmounts}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          {hideAmounts ? <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" /> : null}
        </svg>
        {hideAmounts ? '显示金额' : '隐藏金额'}
      </button>
      <div className="dashboard-summary-cells">
        {cells.map((cell) => (
          <div className="dashboard-summary-cell" key={cell.label}>
            <span className="dashboard-summary-label">{cell.label}</span>
            <strong className="dashboard-summary-value">{display(cell.value)}</strong>
            <small className="dashboard-summary-hint">{display(cell.hint)}</small>
          </div>
        ))}
      </div>
    </section>
  )
}