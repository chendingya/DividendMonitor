import { List, Tag, Typography } from 'antd'
import type { BacktestResultDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

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

function getTransactionMeta(type: BacktestResultDto['transactions'][number]['type']) {
  if (type === 'BUY') return { label: '建仓', color: 'blue' as const, direction: '增加持仓' }
  if (type === 'DCA_BUY') return { label: '定投买入', color: 'cyan' as const, direction: '增加持仓' }
  if (type === 'DIVIDEND') return { label: '分红到账', color: 'gold' as const, direction: '现金流入' }
  if (type === 'REINVEST') return { label: '分红复投', color: 'green' as const, direction: '增加持仓' }
  return { label: '送转调整', color: 'purple' as const, direction: '股数调整' }
}

function MetricCardGlyph({ kind }: { kind: string }) {
  if (kind === 'annual') {
    return (
      <svg className="ledger-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 15l3-4 3 2 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 7h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'cash') {
    return (
      <svg className="ledger-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 12h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16.5" cy="12" r="0.9" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'fee') {
    return (
      <svg className="ledger-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'drawdown') {
    return (
      <svg className="ledger-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 17l3-5 3 3 5-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="17" cy="7" r="1.5" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg className="ledger-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 14.5 11 10l3 2.5L18 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BacktestSummaryCard({ result }: { result: BacktestResultDto }) {
  return (
    <div className="page-section">
      <div className="ledger-metric-grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        <div className="ledger-metric-panel is-primary">
          <div className="ledger-metric-top">
            <div className="ledger-metric-icon">
              <MetricCardGlyph kind="return" />
            </div>
            <div className="ledger-metric-accent">
              {result.benchmarkReturn != null
                ? `${result.totalReturn >= result.benchmarkReturn ? '跑赢' : '跑输'}基准`
                : '总收益'}
            </div>
          </div>
          <div className="ledger-metric-label">总收益率</div>
          <div className="ledger-metric-value">{percent.format(result.totalReturn)}</div>
          <div className="ledger-metric-hint">
            {result.benchmarkReturn != null
              ? `基准 ${percent.format(result.benchmarkReturn)}，差值 ${percent.format(Math.abs(result.totalReturn - result.benchmarkReturn))}`
              : '期末市值 / 初始成本'}
          </div>
        </div>

        <div className="ledger-metric-panel">
          <div className="ledger-metric-top">
            <div className="ledger-metric-icon">
              <MetricCardGlyph kind="annual" />
            </div>
          </div>
          <div className="ledger-metric-label">年化收益率</div>
          <div className="ledger-metric-value">{percent.format(result.annualizedReturn)}</div>
          <div className="ledger-metric-hint">
            {result.benchmarkAnnualizedReturn != null
              ? `基准 ${percent.format(result.benchmarkAnnualizedReturn)}`
              : '按持有天数折算 CAGR'}
          </div>
        </div>

        <div className="ledger-metric-panel">
          <div className="ledger-metric-top">
            <div className="ledger-metric-icon">
              <MetricCardGlyph kind="cash" />
            </div>
          </div>
          <div className="ledger-metric-label">累计现金分红</div>
          <div className="ledger-metric-value">{currency.format(result.totalDividendsReceived)}</div>
          <div className="ledger-metric-hint">
            复投 {result.reinvestCount} 次
            {result.dcaCount > 0 ? ` | 定投 ${result.dcaCount} 次` : ''}
            {` | 初始 ${result.initialShares.toFixed(0)} 股`}
          </div>
        </div>

        <div className="ledger-metric-panel">
          <div className="ledger-metric-top">
            <div className="ledger-metric-icon">
              <MetricCardGlyph kind="fee" />
            </div>
          </div>
          <div className="ledger-metric-label">交易总费用</div>
          <div className="ledger-metric-value">{currency.format(result.totalFees)}</div>
          <div className="ledger-metric-hint">
            期末市值 {currency.format(result.finalMarketValue)}
          </div>
        </div>

        <div className="ledger-metric-panel">
          <div className="ledger-metric-top">
            <div className="ledger-metric-icon">
              <MetricCardGlyph kind="drawdown" />
            </div>
          </div>
          <div className="ledger-metric-label">最大回撤</div>
          <div className="ledger-metric-value" style={{ color: '#e04352' }}>{percent.format(result.maxDrawdown)}</div>
          <div className="ledger-metric-hint">
            持仓市值从峰值最大回落
          </div>
        </div>
      </div>

      <div className="ledger-section">
        <div className="ledger-section-head">
          <h2>回测摘要</h2>
          <span className="pill">{result.symbol}</span>
        </div>

        <div className="ledger-toolbar-card">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '12px 24px'
          }}>
            <div>
              <div className="ledger-stat-label">买入日期</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{result.buyDate}</div>
            </div>
            <div>
              <div className="ledger-stat-label">期末日期</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{result.finalDate}</div>
            </div>
            <div>
              <div className="ledger-stat-label">买入价格</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{currency.format(result.buyPrice)}</div>
            </div>
            <div>
              <div className="ledger-stat-label">初始成本</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{currency.format(result.initialCost)}</div>
            </div>
            <div>
              <div className="ledger-stat-label">期末股数</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{result.finalShares.toFixed(4)}</div>
            </div>
            <div>
              <div className="ledger-stat-label">期末市值</div>
              <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--primary)' }}>{currency.format(result.finalMarketValue)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ledger-section">
        <div className="ledger-section-head">
          <h2>回测假设</h2>
        </div>
        <div className="ledger-toolbar-card">
          <ul style={{
            margin: 0, paddingLeft: 20, display: 'flex',
            flexDirection: 'column', gap: 8, color: '#66707a', fontSize: 13, lineHeight: 1.7
          }}>
            {result.assumptions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <AppCard title="分红与复投流水" extra={<Tag color="blue">{result.transactions.length} 条</Tag>}>
        <List
          dataSource={result.transactions}
          renderItem={(item) => {
            const meta = getTransactionMeta(item.type)
            return (
              <List.Item>
                <List.Item.Meta
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>{item.date}</span>
                      <Tag color={meta.color}>{meta.label}</Tag>
                    </div>
                  }
                  description={
                    <div>
                      <div>{item.note}</div>
                      {item.fee != null && item.fee > 0 ? (
                        <Typography.Text style={{ color: '#e04352' }}>
                          费用 {currency.format(item.fee)}&nbsp;&nbsp;
                        </Typography.Text>
                      ) : null}
                      <Typography.Text style={{ color: '#8b949e' }}>
                        {meta.direction}，当前持仓 {item.sharesAfter.toFixed(4)} 股
                      </Typography.Text>
                    </div>
                  }
                />
                <div style={{ textAlign: 'right', minWidth: 180 }}>
                  <div>{item.cashAmount == null ? '--' : currency.format(item.cashAmount)}</div>
                  <Typography.Text style={{ color: '#66707a' }}>
                    持仓变动 {item.sharesDelta.toFixed(4)} 股
                  </Typography.Text>
                </div>
              </List.Item>
            )
          }}
        />
      </AppCard>
    </div>
  )
}
