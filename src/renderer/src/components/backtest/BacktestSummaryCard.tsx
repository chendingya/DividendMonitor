import { Col, Descriptions, List, Row, Tag, Typography } from 'antd'
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
  if (type === 'BUY') {
    return {
      label: '建仓',
      color: 'blue',
      direction: '增加持仓'
    }
  }

  if (type === 'DIVIDEND') {
    return {
      label: '分红到账',
      color: 'gold',
      direction: '现金流入'
    }
  }

  if (type === 'REINVEST') {
    return {
      label: '分红复投',
      color: 'green',
      direction: '增加持仓'
    }
  }

  return {
    label: '送转调整',
    color: 'purple',
    direction: '股数调整'
  }
}

function CardGlyph({ kind }: { kind: 'return' | 'annual' | 'cash' }) {
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
      <Row gutter={[20, 20]}>
        <Col xs={24} md={8}>
          <AppCard className="metric-card primary">
            <div className="metric-card-icon">
              <CardGlyph kind="return" />
            </div>
            <div className="metric-label">总收益率</div>
            <div className="metric-value">{percent.format(result.totalReturn)}</div>
            <div className="metric-subtle">以期末市值 / 初始成本计算</div>
          </AppCard>
        </Col>
        <Col xs={24} md={8}>
          <AppCard className="metric-card">
            <div className="metric-card-icon">
              <CardGlyph kind="annual" />
            </div>
            <div className="metric-label">年化收益率</div>
            <div className="metric-value">{percent.format(result.annualizedReturn)}</div>
            <div className="metric-subtle">按持有天数折算 CAGR</div>
          </AppCard>
        </Col>
        <Col xs={24} md={8}>
          <AppCard className="metric-card">
            <div className="metric-card-icon">
              <CardGlyph kind="cash" />
            </div>
            <div className="metric-label">累计现金分红</div>
            <div className="metric-value">{currency.format(result.totalDividendsReceived)}</div>
            <div className="metric-subtle">共复投 {result.reinvestCount} 次</div>
          </AppCard>
        </Col>
      </Row>

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={10}>
          <AppCard title="回测摘要" extra={<Tag>{result.symbol}</Tag>}>
            <Descriptions column={1}>
              <Descriptions.Item label="买入日期">{result.buyDate}</Descriptions.Item>
              <Descriptions.Item label="期末日期">{result.finalDate}</Descriptions.Item>
              <Descriptions.Item label="买入价格">{currency.format(result.buyPrice)}</Descriptions.Item>
              <Descriptions.Item label="初始成本">{currency.format(result.initialCost)}</Descriptions.Item>
              <Descriptions.Item label="期末市值">{currency.format(result.finalMarketValue)}</Descriptions.Item>
              <Descriptions.Item label="期末股数">{result.finalShares.toFixed(4)}</Descriptions.Item>
            </Descriptions>
          </AppCard>
        </Col>
        <Col xs={24} xl={14}>
          <AppCard title="回测假设">
            <List
              dataSource={result.assumptions}
              renderItem={(item) => <List.Item style={{ color: '#66707a' }}>{item}</List.Item>}
            />
          </AppCard>
        </Col>
      </Row>

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
