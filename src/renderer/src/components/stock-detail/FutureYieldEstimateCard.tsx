import { Divider, List, Space, Tag, Typography } from 'antd'
import type { FutureYieldEstimateDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function FutureYieldEstimateCard({ estimate }: { estimate: FutureYieldEstimateDto }) {
  const methodLabel = estimate.method === 'baseline' ? '基准法' : '保守法'
  const simplifiedSteps = estimate.isAvailable
    ? estimate.steps.map((_, index) => {
        if (index === 0) {
          return estimate.method === 'baseline'
            ? '先用最新年度净利润乘以上一年的分红率，估算今年可分红的总金额。'
            : '先把上一年实际派发的总分红，视作今年延续的总分红。'
        }

        if (index === 1) {
          return '再用总分红除以最新总股本，得到预计每股分红。'
        }

        return '最后用预计每股分红除以最新股价，得到预计股息率。'
      })
    : estimate.steps

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
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        计算过程
      </Typography.Title>
      <List
        size="small"
        dataSource={simplifiedSteps}
        renderItem={(step, index) => (
          <List.Item style={{ color: '#66707a', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <span className="pill primary" style={{ minWidth: 36, justifyContent: 'center' }}>
                {index + 1}
              </span>
              <span>{step}</span>
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
