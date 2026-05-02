import { Table, Tag } from 'antd'
import type { BacktestResultDto } from '@shared/contracts/api'
import { AppCard } from '@renderer/components/app/AppCard'

const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })

function best(values: number[], pick: 'max' | 'min') {
  const filtered = values.filter((v) => !isNaN(v))
  if (filtered.length === 0) return undefined
  return pick === 'max' ? Math.max(...filtered) : Math.min(...filtered)
}

export function BacktestMultiCompare({ results }: { results: BacktestResultDto[] }) {
  if (results.length < 2) return null

  const returns = results.map((r) => r.totalReturn)
  const annualized = results.map((r) => r.annualizedReturn)
  const drawdowns = results.map((r) => r.maxDrawdown)
  const finalValues = results.map((r) => r.finalMarketValue)
  const fees = results.map((r) => r.totalFees)

  const bestReturn = best(returns, 'max')
  const worstReturn = best(returns, 'min')
  const bestAnnualized = best(annualized, 'max')
  const worstAnnualized = best(annualized, 'min')
  const bestDrawdown = best(drawdowns, 'min')
  const worstDrawdown = best(drawdowns, 'max')
  const bestFinalValue = best(finalValues, 'max')
  const worstFinalValue = best(finalValues, 'min')
  const bestFee = best(fees, 'min')
  const worstFee = best(fees, 'max')

  return (
    <AppCard title="多股票对比" extra={<Tag color="blue">{results.length} 只</Tag>}>
      <Table
        rowKey="symbol"
        dataSource={results}
        pagination={false}
        columns={[
          {
            title: '标的',
            dataIndex: 'symbol',
            render: (v: string) => <Tag color="blue">{v}</Tag>
          },
          {
            title: '总收益率',
            dataIndex: 'totalReturn',
            sorter: (a, b) => a.totalReturn - b.totalReturn,
            render: (v: number) => (
              <span className={`comparison-metric-chip ${v === bestReturn ? 'is-positive' : v === worstReturn ? 'is-cautious' : ''}`}>
                {percent.format(v)}
              </span>
            )
          },
          {
            title: '年化收益率',
            dataIndex: 'annualizedReturn',
            sorter: (a, b) => a.annualizedReturn - b.annualizedReturn,
            render: (v: number) => (
              <span className={`comparison-metric-chip ${v === bestAnnualized ? 'is-positive' : v === worstAnnualized ? 'is-cautious' : ''}`}>
                {percent.format(v)}
              </span>
            )
          },
          {
            title: '最大回撤',
            dataIndex: 'maxDrawdown',
            sorter: (a, b) => a.maxDrawdown - b.maxDrawdown,
            render: (v: number) => (
              <span className={`comparison-metric-chip ${v === bestDrawdown ? 'is-positive' : v === worstDrawdown ? 'is-cautious' : ''}`}>
                {percent.format(v)}
              </span>
            )
          },
          {
            title: '复投次数',
            dataIndex: 'reinvestCount',
            sorter: (a, b) => a.reinvestCount - b.reinvestCount
          },
          {
            title: '定投次数',
            dataIndex: 'dcaCount',
            sorter: (a, b) => a.dcaCount - b.dcaCount
          },
          {
            title: '期末市值',
            dataIndex: 'finalMarketValue',
            sorter: (a, b) => a.finalMarketValue - b.finalMarketValue,
            render: (v: number) => (
              <span className={`comparison-metric-chip ${v === bestFinalValue ? 'is-positive' : v === worstFinalValue ? 'is-cautious' : ''}`}>
                {currency.format(v)}
              </span>
            )
          },
          {
            title: '手续费',
            dataIndex: 'totalFees',
            sorter: (a, b) => a.totalFees - b.totalFees,
            render: (v: number) => (
              <span className={`comparison-metric-chip ${v === bestFee ? 'is-positive' : v === worstFee ? 'is-cautious' : ''}`}>
                {currency.format(v)}
              </span>
            )
          }
        ]}
      />
    </AppCard>
  )
}
