import type { HistoricalPricePoint, Stock, DividendEvent } from '@main/domain/entities/Stock'

export type StockDetailSource = {
  stock: Stock
  dividendEvents: DividendEvent[]
  priceHistory: HistoricalPricePoint[]
  latestAnnualNetProfit: number
  latestTotalShares: number
  lastAnnualPayoutRatio: number
  lastYearTotalDividendAmount: number
  dataSource: 'eastmoney'
}

export interface AShareDataSource {
  search(keyword: string): Promise<Array<{ symbol: string; name: string; market: 'A_SHARE' }>>
  getDetail(symbol: string): Promise<StockDetailSource>
  compare(symbols: string[]): Promise<StockDetailSource[]>
}
