import type { ReactNode } from 'react'

type LedgerIconName = 'yield' | 'wallet' | 'calendar' | 'recent' | 'analysis' | 'allocation' | 'detail' | 'delete' | 'select' | 'plus' | 'groups'

export function LedgerIcon({ name, className }: { name: LedgerIconName; className?: string }) {
  if (name === 'yield') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 15l3-4 3 2 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 7h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'wallet') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 12h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16.5" cy="12" r="0.9" fill="currentColor" />
      </svg>
    )
  }

  if (name === 'calendar') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3.5v3M16 3.5v3M4 10h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'recent') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'analysis') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 18V9M12 18V6M19 18v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'detail') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 5.5C7.6 5.5 3.7 8.3 2 12c1.7 3.7 5.6 6.5 10 6.5s8.3-2.8 10-6.5c-1.7-3.7-5.6-6.5-10-6.5z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (name === 'delete') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16M8 7V5.5A1.5 1.5 0 019.5 4h5A1.5 1.5 0 0116 5.5V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 7l1.5 12.5A1.5 1.5 0 008.9 21h6.2a1.5 1.5 0 001.4-1.5L18 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M9 11v5M12 11v5M15 11v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'select') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'plus') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'groups') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="14" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 10v4M17 10v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5V20.5M3.5 12h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.5 6.5h11v11h-11z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

type MetricPanelProps = {
  label: string
  value: string
  hint?: string
  primary?: boolean
  accent?: ReactNode
  icon?: LedgerIconName
}

function resolveMetricIcon(label: string): LedgerIconName {
  if (label.includes('总价值')) {
    return 'wallet'
  }
  if (label.includes('待派发') || label.includes('数量') || label.includes('市场')) {
    return 'calendar'
  }
  return 'yield'
}

export function MetricPanel({ label, value, hint, primary = false, accent, icon = 'yield' }: MetricPanelProps) {
  const metricIcon = icon === 'yield' ? resolveMetricIcon(label) : icon
  return (
    <section className={`ledger-metric-panel ${primary ? 'is-primary' : ''}`}>
      <div className="ledger-metric-top">
        <span className="ledger-metric-icon">
          <LedgerIcon name={metricIcon} className="ledger-icon-svg" />
        </span>
        {accent ? <div className="ledger-metric-accent">{accent}</div> : null}
      </div>
      <div className="ledger-metric-label">{label}</div>
      <div className="ledger-metric-value">{value}</div>
      {hint ? <div className="ledger-metric-hint">{hint}</div> : null}
    </section>
  )
}

type OpportunityCardProps = {
  symbol: string
  title: string
  subtitle: string
  value: string
  valueLabel?: string
}

export function OpportunityCard({ symbol, title, subtitle, value, valueLabel = '远期收益率' }: OpportunityCardProps) {
  return (
    <section className="ledger-opportunity-card">
      <div className="ledger-opportunity-head">
        <div className="ledger-opportunity-badge">{symbol}</div>
        <div className="ledger-opportunity-value">
          <strong>{value}</strong>
          <span>{valueLabel}</span>
        </div>
      </div>
      <div className="ledger-opportunity-title">{title}</div>
      <div className="ledger-opportunity-subtitle">{subtitle}</div>
    </section>
  )
}

type RecentItemProps = {
  title: string
  subtitle: string
  icon?: LedgerIconName
  onClick?: () => void
}

export function RecentItem({ title, subtitle, icon = 'recent', onClick }: RecentItemProps) {
  return (
    <button type="button" className="ledger-recent-item" onClick={onClick}>
      <div className="ledger-recent-icon">
        <LedgerIcon name={icon} className="ledger-icon-svg" />
      </div>
      <div className="ledger-recent-copy">
        <div className="ledger-recent-title">{title}</div>
        <div className="ledger-recent-subtitle">{subtitle}</div>
      </div>
      <div className="ledger-recent-arrow">&gt;</div>
    </button>
  )
}

type ToolCardProps = {
  title: string
  subtitle: string
  icon?: LedgerIconName
  active?: boolean
  onClick?: () => void
  disabled?: boolean
}

function resolveToolIcon(title: string): LedgerIconName {
  if (title.includes('配置')) {
    return 'allocation'
  }
  return 'analysis'
}

export function ToolCard({ title, subtitle, icon, active, onClick, disabled = false }: ToolCardProps) {
  const toolIcon = icon ?? resolveToolIcon(title)
  const isActive = active ?? title.includes('回测')
  return (
    <button
      className={`ledger-tool-card ${isActive ? 'is-active' : ''}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="ledger-tool-icon">
        <LedgerIcon name={toolIcon} className="ledger-icon-svg" />
      </span>
      <span className="ledger-tool-copy">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
    </button>
  )
}
