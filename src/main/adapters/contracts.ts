import type { HistoricalPricePoint, Stock, DividendEvent } from '@main/domain/entities/Stock'
import type { ValuationMetric, ValuationTrendPoint } from '@main/domain/services/valuationService'

export type StockValuationSource = {
  pe?: ValuationMetric
  pb?: ValuationMetric
}

export type CoreStockDetailSource = {
  stock: Stock
  dividendEvents: DividendEvent[]
  priceHistory: HistoricalPricePoint[]
  latestAnnualNetProfit: number
  latestTotalShares: number
  lastAnnualPayoutRatio: number
  lastYearTotalDividendAmount: number
  dataSource: 'eastmoney'
}

export type StockDetailSource = CoreStockDetailSource & {
  valuation?: StockValuationSource
}

export interface AShareDataSource {
  search(keyword: string): Promise<Array<{ symbol: string; name: string; market: 'A_SHARE' }>>
  getDetail(symbol: string): Promise<CoreStockDetailSource>
  compare(symbols: string[]): Promise<CoreStockDetailSource[]>
}

export type ValuationIndicatorType = 1 | 2

export type ValuationSnapshotSource = {
  currentValue?: number
  currentPercentile?: number
  status?: string
}

export interface ValuationDataSource {
  getSnapshot(symbol: string, indicatorType: ValuationIndicatorType): Promise<ValuationSnapshotSource | undefined>
  getTrend(symbol: string, indicatorType: ValuationIndicatorType): Promise<ValuationTrendPoint[]>
}
