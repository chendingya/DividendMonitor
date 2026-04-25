export type Stock = {
  symbol: string
  name: string
  market: 'A_SHARE'
  industry?: string
  latestPrice: number
  marketCap?: number
  // 市盈率（Price-to-Earnings Ratio, TTM），单位：倍
  peRatio?: number
  // 市净率（Price-to-Book Ratio），单位：倍
  pbRatio?: number
  totalShares?: number
}

export type DividendEvent = {
  year: number
  fiscalYear?: number
  announceDate?: string
  recordDate?: string
  exDate?: string
  payDate?: string
  dividendPerShare: number
  totalDividendAmount?: number
  payoutRatio?: number
  referenceClosePrice: number
  bonusSharePer10?: number
  transferSharePer10?: number
  source: string
}

export type HistoricalPricePoint = {
  date: string
  close: number
}

export type BacktestTransaction = {
  type: 'BUY' | 'DIVIDEND' | 'REINVEST' | 'BONUS_ADJUSTMENT'
  date: string
  price?: number
  cashAmount?: number
  sharesDelta: number
  sharesAfter: number
  note: string
}
