import type { BacktestTransaction, DividendEvent, HistoricalPricePoint } from '@main/domain/entities/Stock'

type BacktestInput = {
  symbol: string
  buyDate: string
  priceHistory: HistoricalPricePoint[]
  dividendEvents: DividendEvent[]
  initialShares?: number
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

export function runDividendReinvestmentBacktest(input: BacktestInput) {
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
  const initialShares = input.initialShares ?? 100
  const initialCost = initialShares * buyPoint.close
  let shares = initialShares
  let totalDividendsReceived = 0
  let reinvestCount = 0

  const transactions: BacktestTransaction[] = [
    {
      type: 'BUY',
      date: buyPoint.date,
      price: buyPoint.close,
      sharesDelta: initialShares,
      sharesAfter: shares,
      note: 'Buy at the first available close price on or after the requested buy date'
    }
  ]

  const dividendEvents = [...input.dividendEvents]
    .filter((event) => {
      const eventAnchor = event.payDate ?? event.exDate
      return Boolean(eventAnchor) && normalizeDate(eventAnchor!) >= buyPoint.date && normalizeDate(eventAnchor!) <= finalPoint.date
    })
    .sort((a, b) => (a.exDate ?? a.payDate ?? '').localeCompare(b.exDate ?? b.payDate ?? ''))

  for (const event of dividendEvents) {
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
        note: `Bonus or transfer shares applied at ${(shareRatio * 100).toFixed(2)}% of entitled shares`
      })
    }

    if (!(event.dividendPerShare > 0) || !event.payDate) {
      continue
    }

    const dividendDate = normalizeDate(event.payDate)
    const cashAmount = entitledShares * event.dividendPerShare
    totalDividendsReceived += cashAmount

    transactions.push({
      type: 'DIVIDEND',
      date: dividendDate,
      cashAmount,
      sharesDelta: 0,
      sharesAfter: shares,
      note: `Cash dividend received for fiscal year ${event.fiscalYear ?? event.year}`
    })

    const reinvestPoint = findFirstPriceOnOrAfter(priceHistory, dividendDate)

    if (!reinvestPoint || !(reinvestPoint.close > 0)) {
      continue
    }

    const newShares = cashAmount / reinvestPoint.close
    shares += newShares
    reinvestCount += 1

    transactions.push({
      type: 'REINVEST',
      date: reinvestPoint.date,
      price: reinvestPoint.close,
      cashAmount,
      sharesDelta: newShares,
      sharesAfter: shares,
      note: 'Reinvest the full cash dividend at the next available close price'
    })
  }

  const finalMarketValue = shares * finalPoint.close
  const totalReturn = finalMarketValue / initialCost - 1
  const holdingDays = daysBetween(buyPoint.date, finalPoint.date)
  const annualizedReturn = Math.pow(finalMarketValue / initialCost, 365 / holdingDays) - 1

  return {
    buyDate: buyPoint.date,
    finalDate: finalPoint.date,
    buyPrice: buyPoint.close,
    initialCost,
    finalShares: shares,
    totalDividendsReceived,
    reinvestCount,
    finalMarketValue,
    totalReturn,
    annualizedReturn,
    assumptions: [
      'Use the first available trading close on or after the requested buy date',
      'Use raw daily close prices (non-adjusted when available) to avoid double-counting dividend effects during explicit reinvestment',
      'Cash dividends are received on pay date and fully reinvested at the next available close',
      'Bonus shares and transfer shares increase holdings separately from cash dividends'
    ],
    transactions
  }
}
