import type { BacktestTransaction, DividendEvent, HistoricalPricePoint } from '@main/domain/entities/Stock'

export type DcaConfig = {
  enabled: boolean
  frequency: 'monthly' | 'quarterly' | 'yearly'
  amount: number
}

export type BacktestInput = {
  symbol: string
  buyDate: string
  priceHistory: HistoricalPricePoint[]
  dividendEvents: DividendEvent[]
  initialShares?: number
  initialCapital?: number
  includeFees?: boolean
  feeRate?: number
  stampDutyRate?: number
  minCommission?: number
  dcaConfig?: DcaConfig
  benchmarkPriceHistory?: HistoricalPricePoint[]
  benchmarkSymbol?: string
}

export type BacktestOutput = {
  buyDate: string
  finalDate: string
  buyPrice: number
  initialCost: number
  initialShares: number
  finalShares: number
  totalDividendsReceived: number
  reinvestCount: number
  dcaCount: number
  finalMarketValue: number
  totalReturn: number
  annualizedReturn: number
  totalFees: number
  benchmarkReturn?: number
  benchmarkAnnualizedReturn?: number
  benchmarkSymbol?: string
  assumptions: string[]
  transactions: BacktestTransaction[]
}

function normalizeDate(date: string) {
  return date.slice(0, 10)
}

function findFirstPriceOnOrAfter(priceHistory: HistoricalPricePoint[], targetDate: string) {
  return priceHistory.find((point) => point.date >= targetDate)
}

function daysBetween(startDate: string, endDate: string) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diff = end.getTime() - start.getTime()
  return Math.max(1, Math.round(diff / (24 * 60 * 60 * 1000)))
}

function calcCommission(amount: number, feeRate: number, minCommission: number): number {
  const commission = amount * feeRate
  return Math.max(commission, minCommission)
}

// A-share stocks trade in lots of 100 shares.
const LOT_SIZE = 100

function roundDownToLots(shares: number): number {
  return Math.floor(shares / LOT_SIZE) * LOT_SIZE
}

function calcShares(
  availableCash: number,
  price: number,
  feeRate: number,
  minCommission: number,
  includeFees: boolean,
  roundLots: boolean = false
): { shares: number; fee: number; cost: number } {
  if (!includeFees) {
    const raw = availableCash / price
    const shares = roundLots ? roundDownToLots(raw) : raw
    return { shares, fee: 0, cost: shares * price }
  }

  // Solve: cash = shares * price + max(shares * price * feeRate, minCommission)
  // First try ignoring minCommission: shares = cash / (price * (1 + feeRate))
  let shares = availableCash / (price * (1 + feeRate))
  let commission = calcCommission(shares * price, feeRate, minCommission)

  if (commission <= minCommission + 0.001) {
    // Min commission applies — buy as many shares as possible after min commission
    const effectiveCash = availableCash - minCommission
    shares = effectiveCash / price
    commission = minCommission
  }

  if (roundLots) {
    shares = roundDownToLots(shares)
    // Recalculate commission against actual trade amount after rounding
    commission = calcCommission(shares * price, feeRate, minCommission)
  }

  return { shares: Math.max(0, shares), fee: commission, cost: shares * price + commission }
}

function calculateReturn(initialValue: number, finalValue: number, startDate: string, endDate: string) {
  const totalReturn = finalValue / initialValue - 1
  const holdingDays = daysBetween(startDate, endDate)
  const annualizedReturn = Math.pow(finalValue / initialValue, 365 / holdingDays) - 1
  return { totalReturn, annualizedReturn }
}

function getFirstTradingDayOfMonth(year: number, month: number, priceHistory: HistoricalPricePoint[]): string | null {
  const points = priceHistory.filter((p) => {
    const d = new Date(p.date)
    return d.getFullYear() === year && d.getMonth() === month
  })
  return points.length > 0 ? points[0].date : null
}

export function runDividendReinvestmentBacktest(input: BacktestInput): BacktestOutput {
  const feeRate = input.feeRate ?? 0.0003
  const minCommission = input.minCommission ?? 5
  const includeFees = input.includeFees ?? false

  const priceHistory = [...input.priceHistory]
    .map((point) => ({ ...point, date: normalizeDate(point.date) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (priceHistory.length === 0) {
    throw new Error(`No historical price data available for ${input.symbol}`)
  }

  const requestedBuyDate = normalizeDate(input.buyDate)
  const earliestPoint = priceHistory[0]

  if (requestedBuyDate < earliestPoint.date) {
    throw new Error(
      `Historical price data for ${input.symbol} currently starts at ${earliestPoint.date}; cannot backtest from ${requestedBuyDate}`
    )
  }

  const buyPoint = findFirstPriceOnOrAfter(priceHistory, requestedBuyDate)
  if (!buyPoint) {
    throw new Error(`No trading price available on or after ${input.buyDate}`)
  }

  const finalPoint = priceHistory[priceHistory.length - 1]

  // Determine initial shares from capital or shares param
  let initialShares: number
  let initialFee = 0

  if (input.initialCapital && input.initialCapital > 0) {
    const result = calcShares(input.initialCapital, buyPoint.close, feeRate, minCommission, includeFees, true)
    initialShares = result.shares
    initialFee = result.fee
  } else {
    initialShares = input.initialShares ?? 100
  }

  const initialCost = initialShares * buyPoint.close + initialFee
  let shares = initialShares
  let totalDividendsReceived = 0
  let reinvestCount = 0
  let dcaCount = 0
  let totalFees = initialFee

  const transactions: BacktestTransaction[] = [
    {
      type: 'BUY',
      date: buyPoint.date,
      price: buyPoint.close,
      sharesDelta: initialShares,
      sharesAfter: shares,
      fee: initialFee > 0 ? initialFee : undefined,
      note: includeFees
        ? `买入 ${initialShares.toFixed(2)} 股，佣金 ${initialFee.toFixed(2)}`
        : `买入 ${initialShares.toFixed(2)} 股`
    }
  ]

  const dividendEvents = [...input.dividendEvents]
    .filter((event) => {
      const eventAnchor = event.payDate ?? event.exDate
      return Boolean(eventAnchor) && normalizeDate(eventAnchor!) >= buyPoint.date && normalizeDate(eventAnchor!) <= finalPoint.date
    })
    .sort((a, b) => (a.exDate ?? a.payDate ?? '').localeCompare(b.exDate ?? b.payDate ?? ''))

  // Build a chronological event queue: dividend events + DCA events
  type TimelineEvent =
    | { kind: 'dividend'; event: DividendEvent }
    | { kind: 'dca'; date: string }

  const timeline: TimelineEvent[] = []

  for (const event of dividendEvents) {
    const anchor = normalizeDate(event.payDate!)
    timeline.push({ kind: 'dividend', event: { ...event, payDate: anchor } })
  }

  // Add DCA events
  const dcaConfig = input.dcaConfig
  if (dcaConfig?.enabled && dcaConfig.amount > 0) {
    const buyDate = new Date(buyPoint.date)
    const endDate = new Date(finalPoint.date)
    const current = new Date(buyDate.getFullYear(), buyDate.getMonth(), 1)

    while (current <= endDate) {
      let dcaDate: string | null = null

      if (dcaConfig.frequency === 'monthly') {
        dcaDate = getFirstTradingDayOfMonth(current.getFullYear(), current.getMonth(), priceHistory)
        current.setMonth(current.getMonth() + 1)
      } else if (dcaConfig.frequency === 'quarterly') {
        dcaDate = getFirstTradingDayOfMonth(current.getFullYear(), current.getMonth(), priceHistory)
        current.setMonth(current.getMonth() + 3)
      } else if (dcaConfig.frequency === 'yearly') {
        dcaDate = getFirstTradingDayOfMonth(current.getFullYear(), current.getMonth(), priceHistory)
        current.setFullYear(current.getFullYear() + 1)
      }

      if (dcaDate && dcaDate >= buyPoint.date && dcaDate <= finalPoint.date) {
        timeline.push({ kind: 'dca', date: dcaDate })
      }
    }
  }

  // Sort timeline by date
  timeline.sort((a, b) => {
    const aDate = a.kind === 'dividend' ? normalizeDate(a.event.payDate ?? a.event.exDate!) : a.date
    const bDate = b.kind === 'dividend' ? normalizeDate(b.event.payDate ?? b.event.exDate!) : b.date
    return aDate.localeCompare(bDate)
  })

  // Process timeline
  const processedDividendKeys = new Set<string>()

  for (const item of timeline) {
    if (item.kind === 'dca') {
      const dcaPoint = findFirstPriceOnOrAfter(priceHistory, item.date)
      if (!dcaPoint || !(dcaPoint.close > 0)) continue

      const dca = input.dcaConfig!
      const result = calcShares(dca.amount, dcaPoint.close, feeRate, minCommission, includeFees, true)
      shares += result.shares
      totalFees += result.fee
      dcaCount += 1

      transactions.push({
        type: 'DCA_BUY',
        date: dcaPoint.date,
        price: dcaPoint.close,
        cashAmount: dca.amount,
        sharesDelta: result.shares,
        sharesAfter: shares,
        fee: result.fee > 0 ? result.fee : undefined,
        note: includeFees
          ? `定投买入 ${result.shares.toFixed(2)} 股，佣金 ${result.fee.toFixed(2)}`
          : `定投买入 ${result.shares.toFixed(2)} 股`
      })
      continue
    }

    const event = item.event
    const dividendKey = `${event.fiscalYear ?? event.year}-${event.payDate}`
    if (processedDividendKeys.has(dividendKey)) continue
    processedDividendKeys.add(dividendKey)

    const entitledShares = shares
    const shareRatio = ((event.bonusSharePer10 ?? 0) + (event.transferSharePer10 ?? 0)) / 10

    if (shareRatio > 0) {
      const addedShares = entitledShares * shareRatio
      const adjustDate = normalizeDate(event.exDate ?? event.payDate ?? buyPoint.date)
      shares += addedShares
      transactions.push({
        type: 'BONUS_ADJUSTMENT',
        date: adjustDate,
        sharesDelta: addedShares,
        sharesAfter: shares,
        note: `送转股调整，比例 ${(shareRatio * 100).toFixed(2)}%`
      })
    }

    if (!(event.dividendPerShare > 0) || !event.payDate) continue

    const dividendDate = normalizeDate(event.payDate)
    const cashAmount = entitledShares * event.dividendPerShare
    totalDividendsReceived += cashAmount

    transactions.push({
      type: 'DIVIDEND',
      date: dividendDate,
      cashAmount,
      sharesDelta: 0,
      sharesAfter: shares,
      note: `现金分红，归属财年 ${event.fiscalYear ?? event.year}`
    })

    const reinvestPoint = findFirstPriceOnOrAfter(priceHistory, dividendDate)
    if (!reinvestPoint || !(reinvestPoint.close > 0)) continue

    const result = calcShares(cashAmount, reinvestPoint.close, feeRate, minCommission, includeFees)
    shares += result.shares
    totalFees += result.fee
    reinvestCount += 1

    transactions.push({
      type: 'REINVEST',
      date: reinvestPoint.date,
      price: reinvestPoint.close,
      cashAmount,
      sharesDelta: result.shares,
      sharesAfter: shares,
      fee: result.fee > 0 ? result.fee : undefined,
      note: includeFees
        ? `股息复投 ${result.shares.toFixed(2)} 股，佣金 ${result.fee.toFixed(2)}`
        : `股息复投 ${result.shares.toFixed(2)} 股`
    })
  }

  const finalMarketValue = shares * finalPoint.close
  const { totalReturn, annualizedReturn } = calculateReturn(initialCost, finalMarketValue, buyPoint.date, finalPoint.date)

  // Benchmark comparison
  let benchmarkReturn: number | undefined
  let benchmarkAnnualizedReturn: number | undefined
  if (input.benchmarkPriceHistory && input.benchmarkPriceHistory.length > 0) {
    const benchmarkStart = findFirstPriceOnOrAfter(input.benchmarkPriceHistory, buyPoint.date)
    const benchmarkEnd = input.benchmarkPriceHistory[input.benchmarkPriceHistory.length - 1]
    if (benchmarkStart && benchmarkEnd && benchmarkStart.close > 0) {
      const bResult = calculateReturn(benchmarkStart.close, benchmarkEnd.close, benchmarkStart.date, benchmarkEnd.date)
      benchmarkReturn = bResult.totalReturn
      benchmarkAnnualizedReturn = bResult.annualizedReturn
    }
  }

  const assumptions: string[] = [
    '使用指定买入日期后第一个交易日收盘价买入'
  ]
  if (includeFees) {
    assumptions.push(`计入交易佣金（费率 ${(feeRate * 100).toFixed(2)}%，最低 ${minCommission}元）`)
  } else {
    assumptions.push('未计入交易佣金')
  }
  if (dcaConfig?.enabled) {
    assumptions.push(`定投模式：每${dcaConfig.frequency === 'monthly' ? '月' : dcaConfig.frequency === 'quarterly' ? '季度' : '年'}投入 ${dcaConfig.amount} 元`)
  }
  assumptions.push(
    '现金分红到账后按下一个交易日收盘价全额复投',
    '送转股独立于现金分红调整持仓'
  )

  return {
    buyDate: buyPoint.date,
    finalDate: finalPoint.date,
    buyPrice: buyPoint.close,
    initialCost,
    initialShares,
    finalShares: shares,
    totalDividendsReceived,
    reinvestCount,
    dcaCount,
    finalMarketValue,
    totalReturn,
    annualizedReturn,
    totalFees,
    benchmarkReturn,
    benchmarkAnnualizedReturn,
    benchmarkSymbol: input.benchmarkSymbol,
    assumptions,
    transactions
  }
}
