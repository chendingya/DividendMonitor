import { Divider, List, Space, Tag, Typography } from 'antd'
import type { FutureYieldEstimateDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

const decimal = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const integer = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0
})

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function formatCurrencyValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return formatScaledValue(value, '元')
}

function formatSharesValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return formatScaledValue(value, '股')
}

function formatPerShareValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return `${decimal.format(value)} 元/股`
}

function formatPriceValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return `${decimal.format(value)} 元`
}

function formatPercentValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return percent.format(value)
}

function formatScaledValue(value: number, suffix: string) {
  const absValue = Math.abs(value)

  if (absValue >= 100000000) {
    return `${decimal.format(value / 100000000)} 亿${suffix}`
  }

  if (absValue >= 10000) {
    return `${decimal.format(value / 10000)} 万${suffix}`
  }

  return `${integer.format(value)} ${suffix}`
}

function buildStepDetails(estimate: FutureYieldEstimateDto) {
  const latestPrice = estimate.inputs.latestPrice
  const latestTotalShares = estimate.inputs.latestTotalShares
  const latestAnnualNetProfit = estimate.inputs.latestAnnualNetProfit
  const lastAnnualPayoutRatio = estimate.inputs.lastAnnualPayoutRatio
  const lastYearTotalDividendAmount = estimate.inputs.lastYearTotalDividendAmount

  if (!estimate.isAvailable) {
    return estimate.steps.map((step) => ({
      title: step,
      detail: ''
    }))
  }

  if (estimate.method === 'baseline') {
    const estimatedTotalDividend =
      latestAnnualNetProfit != null && lastAnnualPayoutRatio != null ? latestAnnualNetProfit * lastAnnualPayoutRatio : null

    return [
      {
        title: '先用最新年度净利润乘以上一年的分红率，估算今年可分红的总金额。',
        detail: `${formatCurrencyValue(latestAnnualNetProfit)} x ${formatPercentValue(lastAnnualPayoutRatio)} = ${formatCurrencyValue(estimatedTotalDividend)}`
      },
      {
        title: '再用总分红除以最新总股本，得到预计每股分红。',
        detail: `${formatCurrencyValue(estimatedTotalDividend)} / ${formatSharesValue(latestTotalShares)} = ${formatPerShareValue(estimate.estimatedDividendPerShare)}`
      },
      {
        title: '最后用预计每股分红除以最新股价，得到预计股息率。',
        detail: `${formatPerShareValue(estimate.estimatedDividendPerShare)} / ${formatPriceValue(latestPrice)} = ${formatPercentValue(estimate.estimatedFutureYield)}`
      }
    ]
  }

  return [
    {
      title: '先把上一年实际派发的总分红，视作今年延续的总分红。',
      detail: `${formatCurrencyValue(lastYearTotalDividendAmount)} = 预计总分红 ${formatCurrencyValue(lastYearTotalDividendAmount)}`
    },
    {
      title: '再用总分红除以最新总股本，得到预计每股分红。',
      detail: `${formatCurrencyValue(lastYearTotalDividendAmount)} / ${formatSharesValue(latestTotalShares)} = ${formatPerShareValue(estimate.estimatedDividendPerShare)}`
    },
    {
      title: '最后用预计每股分红除以最新股价，得到预计股息率。',
      detail: `${formatPerShareValue(estimate.estimatedDividendPerShare)} / ${formatPriceValue(latestPrice)} = ${formatPercentValue(estimate.estimatedFutureYield)}`
    }
  ]
}

export function FutureYieldEstimateCard({ estimate }: { estimate: FutureYieldEstimateDto }) {
  const methodLabel = estimate.method === 'baseline' ? '基准法' : '保守法'
  const stepDetails = buildStepDetails(estimate)

  return (
    <AppCard
      title={
        <span className="ledger-card-title-with-icon">
          <span className="ledger-card-title-icon">
            <svg className="ledger-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M6 15l3-4 3 2 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 7h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          未来股息率估算
        </span>
      }
      extra={<Tag color={estimate.method === 'baseline' ? 'blue' : 'gold'}>{methodLabel}</Tag>}
    >
      <Space direction="vertical" size={18} style={{ width: '100%' }}>
        <div>
          <div className="metric-label">估算股息率</div>
          <div className="metric-value" style={{ color: estimate.isAvailable ? '#0052d0' : '#8b949e' }}>
            {estimate.isAvailable ? percent.format(estimate.estimatedFutureYield) : '--'}
          </div>
          <div className="metric-subtle">
            预计每股分红 {estimate.isAvailable ? estimate.estimatedDividendPerShare.toFixed(3) : '--'}
          </div>
        </div>
        {!estimate.isAvailable && estimate.reason ? (
          <div className="pill danger">{estimate.reason}</div>
        ) : null}
      </Space>
      {estimate.isAvailable ? <Divider style={{ margin: '20px 0 16px' }} /> : null}
      {estimate.isAvailable ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            关键输入
          </Typography.Title>
          <div className="ledger-calc-summary">
            {estimate.method === 'baseline' ? (
              <>
                <div className="ledger-calc-summary-item">
                  <span>最新年度净利润</span>
                  <strong>{formatCurrencyValue(estimate.inputs.latestAnnualNetProfit)}</strong>
                </div>
                <div className="ledger-calc-summary-item">
                  <span>上一年分红率</span>
                  <strong>{formatPercentValue(estimate.inputs.lastAnnualPayoutRatio)}</strong>
                </div>
              </>
            ) : (
              <div className="ledger-calc-summary-item">
                <span>上一年实际总分红</span>
                <strong>{formatCurrencyValue(estimate.inputs.lastYearTotalDividendAmount)}</strong>
              </div>
            )}
            <div className="ledger-calc-summary-item">
              <span>最新总股本</span>
              <strong>{formatSharesValue(estimate.inputs.latestTotalShares)}</strong>
            </div>
            <div className="ledger-calc-summary-item">
              <span>最新股价</span>
              <strong>{formatPriceValue(estimate.inputs.latestPrice)}</strong>
            </div>
          </div>
        </>
      ) : null}
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        计算过程
      </Typography.Title>
      <List
        size="small"
        dataSource={stepDetails}
        renderItem={(step, index) => (
          <List.Item style={{ color: '#66707a', alignItems: 'flex-start' }}>
            <div className="ledger-calc-step">
              <span className="pill primary" style={{ minWidth: 36, justifyContent: 'center' }}>
                {index + 1}
              </span>
              <div className="ledger-calc-step-copy">
                <div>{step.title}</div>
                {step.detail ? <div className="ledger-calc-step-formula">{step.detail}</div> : null}
              </div>
            </div>
          </List.Item>
        )}
      />
      {estimate.isAvailable ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 20 }}>
            关键结果
          </Typography.Title>
          <div className="ledger-calc-summary">
            <div className="ledger-calc-summary-item">
              <span>预计每股分红</span>
              <strong>{estimate.estimatedDividendPerShare.toFixed(3)}</strong>
            </div>
            <div className="ledger-calc-summary-item">
              <span>预计股息率</span>
              <strong>{percent.format(estimate.estimatedFutureYield)}</strong>
            </div>
          </div>
        </>
      ) : null}
    </AppCard>
  )
}
