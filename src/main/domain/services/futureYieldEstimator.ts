export type FutureYieldInput = {
  latestPrice: number
  latestTotalShares: number
  latestAnnualNetProfit: number
  lastAnnualPayoutRatio: number
  lastYearTotalDividendAmount: number
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : 'N/A'
}

function buildUnavailableEstimate(
  method: 'baseline' | 'conservative',
  reason: string,
  input: FutureYieldInput
) {
  return {
    estimatedDividendPerShare: 0,
    estimatedFutureYield: 0,
    method,
    isAvailable: false,
    reason,
    inputs: {
      latestPrice: input.latestPrice ?? null,
      latestTotalShares: input.latestTotalShares ?? null,
      latestAnnualNetProfit: input.latestAnnualNetProfit ?? null,
      lastAnnualPayoutRatio: input.lastAnnualPayoutRatio ?? null,
      lastYearTotalDividendAmount: input.lastYearTotalDividendAmount ?? null
    },
    steps: [reason]
  }
}

export function estimateFutureYield(input: FutureYieldInput) {
  const baseInputs = {
    latestPrice: input.latestPrice ?? null,
    latestTotalShares: input.latestTotalShares ?? null,
    latestAnnualNetProfit: input.latestAnnualNetProfit ?? null,
    lastAnnualPayoutRatio: input.lastAnnualPayoutRatio ?? null,
    lastYearTotalDividendAmount: input.lastYearTotalDividendAmount ?? null
  }

  if (!(input.latestPrice > 0) || !(input.latestTotalShares > 0)) {
    const reason = 'Missing latest price or total shares, future yield cannot be estimated'

    return {
      baseline: buildUnavailableEstimate('baseline', reason, input),
      conservative: buildUnavailableEstimate('conservative', reason, input)
    }
  }

  const canBuildBaseline = input.latestAnnualNetProfit > 0 && input.lastAnnualPayoutRatio > 0
  const canBuildConservative = input.lastYearTotalDividendAmount > 0

  const baseline = canBuildBaseline
    ? (() => {
        const baselineTotalDividend = input.latestAnnualNetProfit * input.lastAnnualPayoutRatio
        const baselineDividendPerShare = baselineTotalDividend / input.latestTotalShares
        const baselineYield = baselineDividendPerShare / input.latestPrice

        return {
          estimatedDividendPerShare: baselineDividendPerShare,
          estimatedFutureYield: baselineYield,
          method: 'baseline' as const,
          isAvailable: true,
          reason: undefined,
          inputs: baseInputs,
          steps: [
            `latestAnnualNetProfit(${formatNumber(input.latestAnnualNetProfit)}) * lastAnnualPayoutRatio(${formatNumber(input.lastAnnualPayoutRatio)}) = estimatedTotalDividend(${formatNumber(baselineTotalDividend)})`,
            `estimatedTotalDividend(${formatNumber(baselineTotalDividend)}) / latestTotalShares(${formatNumber(input.latestTotalShares)}) = estimatedDividendPerShare(${formatNumber(baselineDividendPerShare)})`,
            `estimatedDividendPerShare(${formatNumber(baselineDividendPerShare)}) / latestPrice(${formatNumber(input.latestPrice)}) = estimatedFutureYield(${formatNumber(baselineYield)})`
          ]
        }
      })()
    : buildUnavailableEstimate(
        'baseline',
        'Missing latest annual net profit or last annual payout ratio, baseline estimate unavailable',
        input
      )

  const conservative = canBuildConservative
    ? (() => {
        const conservativeDividendPerShare = input.lastYearTotalDividendAmount / input.latestTotalShares
        const conservativeYield = conservativeDividendPerShare / input.latestPrice

        return {
          estimatedDividendPerShare: conservativeDividendPerShare,
          estimatedFutureYield: conservativeYield,
          method: 'conservative' as const,
          isAvailable: true,
          reason: undefined,
          inputs: baseInputs,
          steps: [
            `lastYearTotalDividendAmount(${formatNumber(input.lastYearTotalDividendAmount)}) / latestTotalShares(${formatNumber(input.latestTotalShares)}) = estimatedDividendPerShare(${formatNumber(conservativeDividendPerShare)})`,
            `estimatedDividendPerShare(${formatNumber(conservativeDividendPerShare)}) / latestPrice(${formatNumber(input.latestPrice)}) = estimatedFutureYield(${formatNumber(conservativeYield)})`
          ]
        }
      })()
    : buildUnavailableEstimate(
        'conservative',
        'Missing last year total dividend amount, conservative estimate unavailable',
        input
      )

  return {
    baseline,
    conservative
  }
}
