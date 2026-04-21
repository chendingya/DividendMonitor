export type Stock = {
  symbol: string
  name: string
  market: 'A_SHARE'
  industry?: string
  latestPrice: number
  marketCap?: number
  peRatio?: number
}

export type DividendEvent = {
  year: number
  dividendPerShare: number
  referenceClosePrice: number
}
