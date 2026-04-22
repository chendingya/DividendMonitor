export type HistoricalYieldPointDto = {
  year: number
  yield: number
  events: number
}

export type FutureYieldEstimateDto = {
  estimatedDividendPerShare: number
  estimatedFutureYield: number
  method: 'baseline' | 'conservative'
  isAvailable: boolean
  reason?: string
  inputs: Record<string, number | null>
  steps: string[]
}

export type DividendEventDto = {
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

export type BacktestTransactionDto = {
  type: 'BUY' | 'DIVIDEND' | 'REINVEST' | 'BONUS_ADJUSTMENT'
  date: string
  price?: number
  cashAmount?: number
  sharesDelta: number
  sharesAfter: number
  note: string
}

export type WatchlistItemDto = {
  symbol: string
  name: string
  market: 'A_SHARE'
  latestPrice: number
  peRatio?: number
  estimatedFutureYield?: number
}

export type ComparisonRowDto = {
  symbol: string
  name: string
  latestPrice: number
  marketCap?: number
  peRatio?: number
  averageYield?: number
  estimatedFutureYield?: number
}

export type BacktestResultDto = {
  symbol: string
  buyDate: string
  finalDate: string
  buyPrice: number
  initialCost: number
  finalShares: number
  totalDividendsReceived: number
  reinvestCount: number
  finalMarketValue: number
  totalReturn: number
  annualizedReturn: number
  assumptions: string[]
  transactions: BacktestTransactionDto[]
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
  totalShares?: number
  dataSource: 'mock' | 'eastmoney'
  yieldBasis: string
  yearlyYields: HistoricalYieldPointDto[]
  dividendEvents: DividendEventDto[]
  futureYieldEstimate: FutureYieldEstimateDto
  futureYieldEstimates: FutureYieldEstimateDto[]
}

export type HistoricalYieldResponseDto = {
  symbol: string
  basis: string
  yearlyYields: HistoricalYieldPointDto[]
  dividendEvents: DividendEventDto[]
}

export type FutureYieldResponseDto = {
  symbol: string
  estimates: FutureYieldEstimateDto[]
}

export interface DividendMonitorApi {
  stock: {
    search(keyword: string): Promise<StockSearchItemDto[]>
    getDetail(symbol: string): Promise<StockDetailDto>
    compare(symbols: string[]): Promise<ComparisonRowDto[]>
  }
  watchlist: {
    list(): Promise<WatchlistItemDto[]>
  }
  calculation: {
    getHistoricalYield(symbol: string): Promise<HistoricalYieldResponseDto>
    estimateFutureYield(symbol: string): Promise<FutureYieldResponseDto>
    runDividendReinvestmentBacktest(symbol: string, buyDate: string): Promise<BacktestResultDto>
  }
}

declare global {
  interface Window {
    dividendMonitor: DividendMonitorApi
  }
}
