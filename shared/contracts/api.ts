export type HistoricalYieldPointDto = {
  year: number
  yield: number
  events: number
}

export type FutureYieldEstimateDto = {
  estimatedDividendPerShare: number
  estimatedFutureYield: number
  method: 'baseline' | 'conservative'
  steps: string[]
}

export type StockSearchItemDto = {
  symbol: string
  name: string
  market: 'A_SHARE'
}

export type StockDetailDto = {
  symbol: string
  name: string
  market: 'A_SHARE'
  industry?: string
  latestPrice: number
  marketCap?: number
  peRatio?: number
  yearlyYields: HistoricalYieldPointDto[]
  futureYieldEstimate: FutureYieldEstimateDto
}

export interface DividendMonitorApi {
  stock: {
    search(keyword: string): Promise<StockSearchItemDto[]>
    getDetail(symbol: string): Promise<StockDetailDto>
  }
}

declare global {
  interface Window {
    dividendMonitor: DividendMonitorApi
  }
}
