import { Input, Button, Space, Typography } from 'antd'
import { AppCard } from '@renderer/components/app/AppCard'
import { useIsMobile } from '@renderer/hooks/useIsMobile'
import { formatTime } from '@renderer/utils/format'
import type { PortfolioPosition } from '@renderer/services/portfolioStore'
import type { PortfolioRow } from '@renderer/hooks/usePortfolio'

type DashboardHeroProps = {
  rows: PortfolioRow[]
  positions: PortfolioPosition[]
  refreshing: boolean
  refreshedAt?: Date | null
  onSearch: () => void
  onRefresh: () => void
  onExportReport: () => void
  onExportPositions: () => void
  onImport: () => void
  onAdd: () => void
}

export function DashboardHero({
  rows,
  positions,
  refreshing,
  refreshedAt,
  onSearch,
  onRefresh,
  onExportReport,
  onExportPositions,
  onImport,
  onAdd
}: DashboardHeroProps) {
  const isMobile = useIsMobile(720)

  if (isMobile) {
    return (
      <section className="ledger-hero-card dashboard-mobile-hero" aria-label="工作台操作">
        <div className="dashboard-mobile-heading">
          <div>
            <div className="ledger-section-kicker">投资组合</div>
            <h1 className="ledger-hero-title">工作台</h1>
          </div>
          <details className="dashboard-mobile-more">
            <summary aria-label="更多操作">更多操作 <span aria-hidden="true">···</span></summary>
            <div className="dashboard-mobile-more-menu">
              <button type="button" disabled={rows.length === 0 || refreshing} onClick={onRefresh}>
                {refreshing ? '刷新中...' : '刷新估值'}
              </button>
              <button type="button" onClick={onImport}>导入持仓</button>
              <button type="button" disabled={positions.length === 0} onClick={onExportPositions}>导出持仓</button>
              <button type="button" disabled={rows.length === 0} onClick={onExportReport}>导出报告</button>
            </div>
          </details>
        </div>
        <p className="ledger-hero-subtitle">查看资产、收益与未来股息</p>
        <div className="dashboard-mobile-primary-actions">
          <button type="button" className="ledger-secondary-button" onClick={onSearch}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></svg>
            搜索资产
          </button>
          <button type="button" className="ledger-primary-button" onClick={onAdd}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg>
            录入持仓
          </button>
        </div>
        {refreshedAt ? <div className="dashboard-mobile-refresh-time">更新于 {formatTime(refreshedAt)}</div> : null}
      </section>
    )
  }

  return (
    <section className="ledger-hero-card">
      <div className="ledger-hero-copy">
        <div>
          <div className="ledger-section-kicker">投资组合</div>
          <h1 className="ledger-hero-title">工作台</h1>
          <p className="ledger-hero-subtitle">实时数据查看估值、收益率和未来股息率</p>
        </div>
        <div className="ledger-hero-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            className="ledger-secondary-button"
            disabled={rows.length === 0}
            onClick={onExportReport}
            style={{ background: '#f0f2f5', borderColor: '#d9dde1', color: '#4e5969' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            导出报告
          </button>
          <button
            type="button"
            className="ledger-secondary-button"
            disabled={positions.length === 0}
            onClick={onExportPositions}
            style={{ background: '#e8f4fd', borderColor: '#b3d8f0', color: '#1677ff' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            导出持仓
          </button>
          <button
            type="button"
            className="ledger-secondary-button"
            onClick={onImport}
            style={{ background: '#e6f7ec', borderColor: '#a3d9b1', color: '#00a854' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            导入持仓
          </button>
          <button
            type="button"
            className="ledger-secondary-button"
            disabled={rows.length === 0}
            onClick={onRefresh}
            style={{ background: '#fff7e6', borderColor: '#ffd591', color: '#d46b08' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {refreshing ? '刷新中...' : '刷新估值'}
            {refreshedAt ? (
              <span style={{ fontSize: 12, color: '#8b949e', marginLeft: 8 }}>
                最近刷新 {formatTime(refreshedAt)}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="ledger-secondary-button"
            onClick={onSearch}
            style={{ background: '#f0f5ff', borderColor: '#adc6ff', color: '#2f54eb' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            搜索资产
          </button>
          <button type="button" className="ledger-primary-button" onClick={onAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: -2 }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            录入持仓
          </button>
        </div>
      </div>
    </section>
  )
}

export function DashboardSearchCard({
  searchKeyword,
  onSearchKeywordChange,
  onSearch
}: {
  searchKeyword: string
  onSearchKeywordChange: (value: string) => void
  onSearch: () => void
}) {
  const isMobile = useIsMobile(720)

  if (isMobile) {
    return (
      <details className="dashboard-mobile-search">
        <summary>按代码或名称搜索</summary>
        <div className="dashboard-mobile-search-form">
          <Input
            aria-label="资产代码或名称"
            placeholder="例如 601398 / 红利ETF"
            value={searchKeyword}
            onChange={(event) => onSearchKeywordChange(event.target.value)}
            onPressEnter={onSearch}
          />
          <button type="button" className="ledger-primary-button" onClick={onSearch}>搜索</button>
        </div>
      </details>
    )
  }

  return (
    <AppCard title="资产搜索">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="输入股票、ETF、基金或贵金属代码/名称，例如 510880 / 红利ETF / 贵州茅台 / 黄金"
            value={searchKeyword}
            onChange={(event) => onSearchKeywordChange(event.target.value)}
            onPressEnter={onSearch}
          />
          <Button onClick={onSearch}>搜索</Button>
        </Space.Compact>
        <Typography.Text type="secondary">搜索会进入结果列表页，统一展示股票、ETF、基金与贵金属，再选择进入详情或加入自选。</Typography.Text>
        <Typography.Text type="secondary">工作台里的持仓录入现已支持股票、ETF、基金与贵金属，输入代码或名称会自动识别资产类型。</Typography.Text>
      </Space>
    </AppCard>
  )
}
