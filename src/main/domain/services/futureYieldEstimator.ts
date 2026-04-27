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

export type FundFutureYieldInput = {
  latestPrice: number
  dividendEvents: { year: number; dividendPerShare: number }[]
}

function buildFundUnavailable(method: 'baseline' | 'conservative', reason: string, inputs: Record<string, number | null>) {
  return {
    estimatedDividendPerShare: 0,
    estimatedFutureYield: 0,
    method,
    isAvailable: false,
    reason,
    inputs: { ...inputs },
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

export function estimateFundFutureYield(input: FundFutureYieldInput) {
  const baseInputs: Record<string, number | null> = {
    latestPrice: input.latestPrice ?? null,
    availableYearCount: null,
    baselineYearDistPerShare: null,
    baselineYear: null,
    avgAnnualDistPerShare: null,
    conservativeYearCount: null
  }

  if (!(input.latestPrice > 0)) {
    const reason = '最新价格无效，无法估算未来分配率'
    return {
      baseline: buildFundUnavailable('baseline', reason, baseInputs),
      conservative: buildFundUnavailable('conservative', reason, baseInputs)
    }
  }

  if (!input.dividendEvents || input.dividendEvents.length === 0) {
    const reason = '暂无历史分配记录，无法估算未来分配率'
    return {
      baseline: buildFundUnavailable('baseline', reason, baseInputs),
      conservative: buildFundUnavailable('conservative', reason, baseInputs)
    }
  }

  const yearTotals = new Map<number, number>()
  const yearEventCounts = new Map<number, number>()

  for (const event of input.dividendEvents) {
    const current = yearTotals.get(event.year) ?? 0
    yearTotals.set(event.year, current + event.dividendPerShare)
    yearEventCounts.set(event.year, (yearEventCounts.get(event.year) ?? 0) + 1)
  }

  const sortedYears = [...yearTotals.entries()].sort((a, b) => b[0] - a[0])

  const [baselineYear, baselineTotal] = sortedYears[0]
  const baselineDividendPerShare = baselineTotal
  const baselineYield = baselineDividendPerShare / input.latestPrice

  const conservativeYears = sortedYears.slice(0, Math.min(3, sortedYears.length))
  const conservativeTotal = conservativeYears.reduce((sum, [, total]) => sum + total, 0)
  const conservativeDividendPerShare = conservativeTotal / conservativeYears.length
  const conservativeYield = conservativeDividendPerShare / input.latestPrice

  return {
    baseline: {
      estimatedDividendPerShare: baselineDividendPerShare,
      estimatedFutureYield: baselineYield,
      method: 'baseline' as const,
      isAvailable: true,
      reason: undefined,
      inputs: {
        ...baseInputs,
        availableYearCount: sortedYears.length,
        baselineYearDistPerShare: baselineDividendPerShare,
        baselineYear,
        avgAnnualDistPerShare: null,
        conservativeYearCount: null
      },
      steps: [
        `最近完成年份（${baselineYear}）的分配记录：${yearEventCounts.get(baselineYear)} 次事件，每份合计 ${formatNumber(baselineTotal)} 元`,
        `每份分配 ${formatNumber(baselineTotal)} / 最新价格 ${formatNumber(input.latestPrice)} = 估算分配率 ${formatNumber(baselineYield)}`
      ]
    },
    conservative: {
      estimatedDividendPerShare: conservativeDividendPerShare,
      estimatedFutureYield: conservativeYield,
      method: 'conservative' as const,
      isAvailable: true,
      reason: undefined,
      inputs: {
        ...baseInputs,
        availableYearCount: sortedYears.length,
        baselineYearDistPerShare: null,
        baselineYear: null,
        avgAnnualDistPerShare: conservativeDividendPerShare,
        conservativeYearCount: conservativeYears.length
      },
      steps: [
        `最近 ${conservativeYears.length} 年（${conservativeYears.map(([y]) => y).join('、')}）的分配记录：每份合计 ${formatNumber(conservativeTotal)} 元`,
        `年均每份分配 ${formatNumber(conservativeDividendPerShare)} / 最新价格 ${formatNumber(input.latestPrice)} = 估算分配率 ${formatNumber(conservativeYield)}`
      ]
    }
  }
}
