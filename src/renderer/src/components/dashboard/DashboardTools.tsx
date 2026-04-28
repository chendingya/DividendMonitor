import { RecentItem, ToolCard } from '@renderer/components/app/LedgerUi'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'
import type { PortfolioRow, RecentBrowseItem } from '@renderer/hooks/usePortfolio'

type DashboardToolsProps = {
  recentItems: RecentBrowseItem[]
  rows: PortfolioRow[]
  onGoToDetail: (row: { assetKey: string; symbol: string }) => void
  onNavigateToBacktest: () => void
  onNavigateToComparison: () => void
}

export function DashboardTools({
  recentItems,
  rows,
  onGoToDetail,
  onNavigateToBacktest,
  onNavigateToComparison
}: DashboardToolsProps) {
  const hasPositions = rows.some((item) => item.assetKey)
  const comparisonCount = rows
    .map((item) => item.assetKey)
    .filter((item): item is string => Boolean(item)).length

  return (
    <section className="ledger-dual-grid">
      <div className="ledger-section">
        <div className="ledger-section-head">
          <h2>最近浏览</h2>
        </div>
        <div className="ledger-list-card">
          {recentItems.length === 0 ? (
            <PageStateBlock kind="empty" title="暂无最近浏览" description="访问资产详情后，这里会出现最近浏览记录。" />
          ) : (
            recentItems.map((item) => (
              <RecentItem
                key={item.symbol}
                title={item.title}
                subtitle={item.subtitle}
                onClick={() => onGoToDetail(item)}
              />
            ))
          )}
        </div>
      </div>

      <div className="ledger-section">
        <div className="ledger-section-head">
          <h2>快捷工具</h2>
        </div>
        <div className="ledger-tools-stack">
          <ToolCard
            title="收益回测工具"
            subtitle="针对最近标的快速进入回测。"
            onClick={onNavigateToBacktest}
            disabled={!hasPositions}
          />
          <ToolCard
            title="多股对比"
            subtitle="选择当前持仓前 3 个资产进行对比。"
            onClick={onNavigateToComparison}
            disabled={comparisonCount < 2}
          />
        </div>
      </div>
    </section>
  )
}
