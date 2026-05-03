import { AppCard } from '@renderer/components/app/AppCard'
import type { IndexValuationDto, ValuationWindowKeyDto } from '@shared/contracts/api'

type IndexValuationCardProps = {
  indexValuation: IndexValuationDto
  valuationWindow: ValuationWindowKeyDto
}

function formatRatioValue(value?: number) {
  return value == null ? '--' : value.toFixed(2)
}

export function IndexValuationCard({ indexValuation, valuationWindow }: IndexValuationCardProps) {
  const peWindow = indexValuation.pe?.windows.find((item) => item.window === valuationWindow)
  const pbWindow = indexValuation.pb?.windows.find((item) => item.window === valuationWindow)

  return (
    <AppCard title="跟踪指数估值">
      <div style={{ marginBottom: 12, fontSize: 13, color: '#66707a' }}>
        {indexValuation.indexName}
        <span className="pill" style={{ marginLeft: 8 }}>{indexValuation.indexCode}</span>
        {indexValuation.source === 'danjuan' && (
          <span style={{ marginLeft: 8, fontSize: 12, color: '#8b949e' }}>数据来源：蛋卷基金（仅快照）</span>
        )}
      </div>
      <div className="ledger-valuation-grid">
        {indexValuation.pe && (
          <div className="ledger-valuation-card">
            <div className="ledger-valuation-head">
              <div>
                <div className="ledger-stat-label">PE(TTM)</div>
                <div className="ledger-valuation-primary">{formatRatioValue(indexValuation.pe.currentValue)}</div>
              </div>
              <span className="pill primary">
                {peWindow?.percentile == null
                  ? indexValuation.pe.currentPercentile != null
                    ? `${indexValuation.pe.currentPercentile.toFixed(2)}%`
                    : '--'
                  : `${peWindow.percentile.toFixed(2)}%`}
              </span>
            </div>
            <div className="ledger-valuation-status">
              {indexValuation.pe.currentValue != null && indexValuation.pe.currentValue < 0
                ? 'PE 为负，暂无分位'
                : indexValuation.pe.status ?? '暂无分位状态'}
            </div>
            {peWindow && peWindow.p30 != null && (
              <div className="ledger-valuation-band">
                <span>30分位 {formatRatioValue(peWindow.p30)}</span>
                <span>50分位 {formatRatioValue(peWindow.p50)}</span>
                <span>70分位 {formatRatioValue(peWindow.p70)}</span>
              </div>
            )}
          </div>
        )}
        {indexValuation.pb && (
          <div className="ledger-valuation-card">
            <div className="ledger-valuation-head">
              <div>
                <div className="ledger-stat-label">PB(MRQ)</div>
                <div className="ledger-valuation-primary">{formatRatioValue(indexValuation.pb.currentValue)}</div>
              </div>
              <span className="pill primary">
                {pbWindow?.percentile == null
                  ? indexValuation.pb.currentPercentile != null
                    ? `${indexValuation.pb.currentPercentile.toFixed(2)}%`
                    : '--'
                  : `${pbWindow.percentile.toFixed(2)}%`}
              </span>
            </div>
            <div className="ledger-valuation-status">
              {indexValuation.pb.currentValue != null && indexValuation.pb.currentValue < 0
                ? 'PB 为负，暂无分位'
                : indexValuation.pb.status ?? '暂无分位状态'}
            </div>
            {pbWindow && pbWindow.p30 != null && (
              <div className="ledger-valuation-band">
                <span>30分位 {formatRatioValue(pbWindow.p30)}</span>
                <span>50分位 {formatRatioValue(pbWindow.p50)}</span>
                <span>70分位 {formatRatioValue(pbWindow.p70)}</span>
              </div>
            )}
          </div>
        )}
        {!indexValuation.pe && !indexValuation.pb && (
          <div className="ledger-valuation-status">暂无该指数的估值数据</div>
        )}
      </div>
    </AppCard>
  )
}
