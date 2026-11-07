import type { RecentTransactionItem } from '@renderer/pages/dashboardSummary'
import { maskAmount } from '@renderer/utils/amountPrivacy'
import { PageStateBlock } from '@renderer/components/app/PageStateBlock'

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const KIND_LABEL: Record<RecentTransactionItem['kind'], string> = {
  BUY: '买入',
  SELL: '卖出',
  DIVIDEND: '分红'
}

type RecentTransactionsCardProps = {
  items: RecentTransactionItem[]
  hideAmounts: boolean
}

export function RecentTransactionsCard({ items, hideAmounts }: RecentTransactionsCardProps) {
  const display = (text: string) => (hideAmounts ? maskAmount(text) : text)
  return (
    <section className="ledger-toolbar-card dashboard-recent-tx" aria-label="最近交易">
      <div className="ledger-section-head">
        <h2>最近交易</h2>
      </div>
      {items.length === 0 ? (
        <PageStateBlock kind="empty" title="暂无交易记录" description="录入持仓交易后，这里会展示最近的买卖与分红记录。" />
      ) : (
        <div className="dashboard-recent-tx-list">
          {items.map((item) => (
            <div className="dashboard-recent-tx-row" key={item.id}>
              <span className="dashboard-recent-tx-date">{item.date}</span>
              <div className="dashboard-recent-tx-asset">
                <strong>{item.assetName}</strong>
                <small>{item.code} · {display(item.detail)}</small>
              </div>
              <span className={`dashboard-recent-tx-kind is-${item.kind.toLowerCase()}`}>{KIND_LABEL[item.kind]}</span>
              <span className="dashboard-recent-tx-amount">
                {item.kind === 'BUY' ? '−' : '+'}{display(currency.format(item.amount))}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}