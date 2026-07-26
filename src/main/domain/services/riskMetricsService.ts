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

  // 使用复权价（前复权）计算收益序列，消除除权除息跳空对波动率/夏普的失真
  const closes = priceHistory.map((p) => p.qfqClose ?? p.close)
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
