import type { HistoricalPricePoint, Stock, DividendEvent } from '@main/domain/entities/Stock'
import type { ValuationMetric } from '@main/domain/services/valuationService'

export type StockValuationSource = {
  pe?: ValuationMetric
  pb?: ValuationMetric
}

export type StockDetailSource = {
  stock: Stock
  dividendEvents: DividendEvent[]
  priceHistory: HistoricalPricePoint[]
  latestAnnualNetProfit: number
  latestTotalShares: number
  lastAnnualPayoutRatio: number
  lastYearTotalDividendAmount: number
  dataSource: 'eastmoney'
  valuation?: StockValuationSource
}

export interface AShareDataSource {
  search(keyword: string): Promise<Array<{ symbol: string; name: string; market: 'A_SHARE' }>>
  getDetail(symbol: string): Promise<StockDetailSource>
  compare(symbols: string[]): Promise<StockDetailSource[]>
}
