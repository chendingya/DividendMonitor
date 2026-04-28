import type { HistoricalPricePoint } from '@main/domain/entities/Stock'

const TRADING_DAYS_PER_YEAR = 252
const DEFAULT_RISK_FREE_RATE = 0.025
const MIN_COMMON_DAYS = 20

export type HoldingInfo = {
  assetKey: string
  name: string
  weight: number
  priceHistory: HistoricalPricePoint[]
}

export type PortfolioRiskResult = {
  portfolioVolatility: number
  portfolioSharpeRatio: number
  maxDrawdown: number
  commonDateRange?: { start: string; end: string; tradingDays: number }
  correlationMatrix: {
    assetKeys: string[]
    names: string[]
    matrix: number[][]
  }
}

function computeDailyReturns(closes: number[]): number[] {
  const returns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] <= 0) continue
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }
  return returns
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

function stdDev(values: number[], meanVal: number): number {
  const variance =
    values.reduce((sum, v) => sum + (v - meanVal) * (v - meanVal), 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length
  const meanX = mean(xs)
  const meanY = mean(ys)
  let cov = 0
  let varX = 0
  let varY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    cov += dx * dy
    varX += dx * dx
    varY += dy * dy
  }
  const denom = Math.sqrt(varX * varY)
  if (denom === 0) return 0
  return cov / denom
}

export function calculatePortfolioRisk(
  holdings: HoldingInfo[],
  riskFreeRate: number = DEFAULT_RISK_FREE_RATE
): PortfolioRiskResult | undefined {
  if (holdings.length === 0) return undefined

  const dateSets = holdings.map((h) => {
    const map = new Map<string, number>()
    h.priceHistory.forEach((p) => map.set(p.date.slice(0, 10), p.close))
    return map
  })

  const commonDates = [...dateSets[0].keys()]
    .filter((date) => dateSets.every((ds) => ds.has(date)))
    .sort()

  if (commonDates.length < MIN_COMMON_DAYS) return undefined

  const assetReturnSeries: number[][] = holdings.map((_, idx) => {
    const ds = dateSets[idx]
    const closes = commonDates.map((date) => ds.get(date)!)
    return computeDailyReturns(closes)
  })

  const validLen = assetReturnSeries[0].length
  if (validLen < MIN_COMMON_DAYS - 1) return undefined

  const portfolioDailyReturns: number[] = []
  for (let i = 0; i < validLen; i++) {
    let r = 0
    for (let j = 0; j < holdings.length; j++) {
      r += assetReturnSeries[j][i] * holdings[j].weight
    }
    portfolioDailyReturns.push(r)
  }

  const portfolioMean = mean(portfolioDailyReturns)
  const portfolioStd = stdDev(portfolioDailyReturns, portfolioMean)
  const portfolioVolatility = portfolioStd * Math.sqrt(TRADING_DAYS_PER_YEAR)
  const annualReturn = portfolioMean * TRADING_DAYS_PER_YEAR
  const portfolioSharpeRatio =
    portfolioVolatility > 0 ? (annualReturn - riskFreeRate) / portfolioVolatility : 0

  let peak = 0
  let maxDrawdown = 0
  let cumulative = 1
  for (const r of portfolioDailyReturns) {
    cumulative *= 1 + r
    peak = Math.max(peak, cumulative)
    const drawdown = (peak - cumulative) / peak
    maxDrawdown = Math.max(maxDrawdown, drawdown)
  }

  const assetKeys = holdings.map((h) => h.assetKey)
  const names = holdings.map((h) => h.name)
  const matrix: number[][] = []
  for (let i = 0; i < holdings.length; i++) {
    const row: number[] = []
    for (let j = 0; j < holdings.length; j++) {
      if (i === j) {
        row.push(1)
      } else if (j < i) {
        row.push(matrix[j][i])
      } else {
        row.push(pearsonCorrelation(assetReturnSeries[i], assetReturnSeries[j]))
      }
    }
    matrix.push(row)
  }

  return {
    portfolioVolatility,
    portfolioSharpeRatio,
    maxDrawdown,
    commonDateRange: {
      start: commonDates[0],
      end: commonDates[commonDates.length - 1],
      tradingDays: commonDates.length
    },
    correlationMatrix: { assetKeys, names, matrix }
  }
}
