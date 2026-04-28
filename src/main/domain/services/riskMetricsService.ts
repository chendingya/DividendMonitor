import type { HistoricalPricePoint } from '@main/domain/entities/Stock'

const TRADING_DAYS_PER_YEAR = 252
const DEFAULT_RISK_FREE_RATE = 0.025
const MIN_DATA_POINTS = 20

export type RiskMetrics = {
  annualVolatility: number
  sharpeRatio: number
}

export function calculateRiskMetrics(
  priceHistory: HistoricalPricePoint[],
  riskFreeRate: number = DEFAULT_RISK_FREE_RATE
): RiskMetrics | undefined {
  if (priceHistory.length < MIN_DATA_POINTS) {
    return undefined
  }

  const closes = priceHistory.map((p) => p.close)
  const returns: number[] = []

  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] <= 0) continue
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }

  if (returns.length < MIN_DATA_POINTS - 1) {
    return undefined
  }

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) * (r - mean), 0) / (returns.length - 1)
  const dailyStd = Math.sqrt(variance)

  const annualVolatility = dailyStd * Math.sqrt(TRADING_DAYS_PER_YEAR)
  const annualReturn = mean * TRADING_DAYS_PER_YEAR
  const sharpeRatio = annualVolatility > 0 ? (annualReturn - riskFreeRate) / annualVolatility : 0

  return { annualVolatility, sharpeRatio }
}
