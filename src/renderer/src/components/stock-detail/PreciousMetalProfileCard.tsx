import { AppCard } from '@renderer/components/app/AppCard'
import { usePreciousMetalDisplay } from '@renderer/contexts/PreciousMetalDisplayContext'
import type { PreciousMetalAssetModuleDto } from '@shared/contracts/api'

type PreciousMetalProfileCardProps = {
  module: PreciousMetalAssetModuleDto
}

export function PreciousMetalProfileCard({ module }: PreciousMetalProfileCardProps) {
  const { unit, currency, rateLoading, setUnit, setCurrency, formatPrice, priceLabel } = usePreciousMetalDisplay()

  const prices = { sgePriceCnyPerGram: module.sgePriceCnyPerGram, internationalPriceUsdPerOz: module.internationalPriceUsdPerOz }

  return (
    <AppCard
      title="贵金属档案"
      extra={
        <div className="ledger-segmented-control">
          <button
            type="button"
            className={`ledger-filter-chip ${unit === 'gram' ? 'is-active' : ''}`}
            onClick={() => void setUnit('gram')}
          >
            克
          </button>
          <button
            type="button"
            className={`ledger-filter-chip ${unit === 'ounce' ? 'is-active' : ''}`}
            onClick={() => void setUnit('ounce')}
          >
            盎司
          </button>
          <span style={{ width: 8 }} />
          <button
            type="button"
            className={`ledger-filter-chip ${currency === 'CNY' ? 'is-active' : ''}`}
            onClick={() => void setCurrency('CNY')}
          >
            ¥
          </button>
          <button
            type="button"
            className={`ledger-filter-chip ${currency === 'USD' ? 'is-active' : ''}`}
            onClick={() => void setCurrency('USD')}
            disabled={rateLoading}
          >
            $
          </button>
        </div>
      }
    >
      <div className="ledger-valuation-grid">
        <div className="ledger-valuation-card">
          <div className="ledger-stat-label">最新价</div>
          <div className="ledger-valuation-primary">{formatPrice(prices)}</div>
          <div className="ledger-valuation-status">{priceLabel}</div>
        </div>
        <div className="ledger-valuation-card">
          <div className="ledger-stat-label">合约代码</div>
          <div className="ledger-valuation-primary">{module.contractCode}</div>
          <div className="ledger-valuation-status">纯度：{module.purity ?? '--'}</div>
        </div>
        <div className="ledger-valuation-card">
          <div className="ledger-stat-label">交易所</div>
          <div className="ledger-valuation-primary">{module.exchangeName ?? '--'}</div>
          <div className="ledger-valuation-status">品种：{module.metal === 'GOLD' ? '黄金' : '白银'}</div>
        </div>
      </div>
    </AppCard>
  )
}
