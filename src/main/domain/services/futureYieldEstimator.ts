export type FutureYieldInput = {
  latestPrice: number
  latestTotalShares: number
  latestAnnualNetProfit: number
  lastAnnualPayoutRatio: number
  lastYearTotalDividendAmount: number
}

export function estimateFutureYield(input: FutureYieldInput) {
  const baselineTotalDividend = input.latestAnnualNetProfit * input.lastAnnualPayoutRatio
  const baselineDividendPerShare = baselineTotalDividend / input.latestTotalShares
  const baselineYield = baselineDividendPerShare / input.latestPrice

  const conservativeDividendPerShare = input.lastYearTotalDividendAmount / input.latestTotalShares
  const conservativeYield = conservativeDividendPerShare / input.latestPrice

  return {
    baseline: {
      estimatedDividendPerShare: baselineDividendPerShare,
      estimatedFutureYield: baselineYield,
      method: 'baseline' as const,
      steps: [
        'latestAnnualNetProfit * lastAnnualPayoutRatio = estimatedTotalDividend',
        'estimatedTotalDividend / latestTotalShares = estimatedDividendPerShare',
        'estimatedDividendPerShare / latestPrice = estimatedFutureYield'
      ]
    },
    conservative: {
      estimatedDividendPerShare: conservativeDividendPerShare,
      estimatedFutureYield: conservativeYield,
      method: 'conservative' as const,
      steps: [
        'lastYearTotalDividendAmount / latestTotalShares = estimatedDividendPerShare',
        'estimatedDividendPerShare / latestPrice = estimatedFutureYield'
      ]
    }
  }
}
