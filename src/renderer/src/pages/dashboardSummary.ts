export type AssetTypeDistributionInput = {
  assetType?: string
  marketValue?: number
}

export type AssetTypeSlice = { name: string; value: number; color: string }

export type RecentTxRowInput = {
  id: string
  name: string
  code?: string
  symbol?: string
  transactions: Array<{
    id: string
    direction: 'BUY' | 'SELL'
    shares: number
    avgCost: number
    tradePrice?: number
    openedAt?: string
    updatedAt: string
  }>
}

export type RecentTxDividendInput = {
  assetKey: string
  assetName: string
  code: string
  exDate: string
  estimatedDividendAmount: number
}

export type RecentTransactionItem = {
  id: string
  date: string
  kind: 'BUY' | 'SELL' | 'DIVIDEND'
  assetName: string
  code: string
  amount: number
  detail: string
}

export type SummaryCellsInput = {
  totalValue: number
  totalCost: number
  totalReturn: number
  avgYieldMetric: number | undefined
  rowCount: number
  forecast: { year: number; annualEstimatedTotal: number; yearToDateActual: number } | null
}

export type SummaryCell = { label: string; value: string; hint: string }

const TYPE_META: Record<string, { name: string; color: string }> = {
  STOCK: { name: '股票', color: '#0052d0' },
  ETF: { name: 'ETF', color: '#5b8def' },
  FUND: { name: '基金', color: '#a3bffa' },
  GOLD: { name: '贵金属', color: '#d4a017' },
  SILVER: { name: '贵金属', color: '#d4a017' }
}

export function buildAssetTypeDistribution(rows: AssetTypeDistributionInput[]): AssetTypeSlice[] {
  const buckets = new Map<string, { value: number; color: string }>()
  for (const row of rows) {
    const mv = row.marketValue
    if (mv == null || mv <= 0) continue
    const meta = TYPE_META[row.assetType ?? ''] ?? { name: '其他', color: '#94a3b8' }
    const entry = buckets.get(meta.name) ?? { value: 0, color: meta.color }
    entry.value += mv
    buckets.set(meta.name, entry)
  }
  return [...buckets.entries()]
    .map(([name, entry]) => ({ name, value: entry.value, color: entry.color }))
    .sort((a, b) => b.value - a.value)
}

export function buildRecentTransactions(
  rows: RecentTxRowInput[],
  dividends: RecentTxDividendInput[],
  limit: number
): RecentTransactionItem[] {
  const items: RecentTransactionItem[] = []
  for (const row of rows) {
    for (const tx of row.transactions) {
      const price = tx.tradePrice ?? tx.avgCost
      items.push({
        id: tx.id,
        date: tx.openedAt ?? tx.updatedAt.slice(0, 10),
        kind: tx.direction,
        assetName: row.name,
        code: row.symbol ?? row.code ?? '',
        amount: tx.shares * price,
        detail: `${tx.shares} 股 @ ${price}`
      })
    }
  }
  for (const div of dividends) {
    items.push({
      id: `div:${div.assetKey}:${div.exDate}`,
      date: div.exDate,
      kind: 'DIVIDEND',
      assetName: div.assetName,
      code: div.code,
      amount: div.estimatedDividendAmount,
      detail: '现金分红'
    })
  }
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function buildSummaryCells(input: SummaryCellsInput): SummaryCell[] {
  const empty = input.rowCount === 0
  const gain = input.totalValue - input.totalCost
  const gainText = `${gain >= 0 ? '+' : '-'}${currency.format(Math.abs(gain))} · ${percent.format(input.totalReturn)}`
  return [
    {
      label: '持仓总市值',
      value: empty ? '--' : currency.format(input.totalValue),
      hint: empty ? '暂无持仓' : `${gainText} 持仓收益`
    },
    {
      label: '投入成本',
      value: empty ? '--' : currency.format(input.totalCost),
      hint: `${input.rowCount} 个标的`
    },
    {
      label: '年度分红（预估）',
      value: input.forecast ? currency.format(input.forecast.annualEstimatedTotal) : '--',
      hint: input.forecast ? `今年已到账 ${currency.format(input.forecast.yearToDateActual)}` : '需持仓填写买入日期'
    },
    {
      label: '加权收益指标',
      value: input.avgYieldMetric == null ? '--' : percent.format(input.avgYieldMetric),
      hint: '按持仓市值加权'
    }
  ]
}