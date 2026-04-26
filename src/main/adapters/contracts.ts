import type { HistoricalPricePoint, Stock, DividendEvent } from '@main/domain/entities/Stock'
import type { ValuationMetric, ValuationTrendPoint } from '@main/domain/services/valuationService'
import type { AssetType } from '@shared/contracts/api'

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

export type FundSearchSource = {
  assetType: Extract<AssetType, 'ETF' | 'FUND'>
  code: string
  name: string
  market: 'A_SHARE'
}

export interface FundCatalogDataSource {
  search(keyword: string, assetType?: Extract<AssetType, 'ETF' | 'FUND'>): Promise<FundSearchSource[]>
}

export type FundDetailSource = {
  assetType: Extract<AssetType, 'ETF' | 'FUND'>
  code: string
  name: string
  market: 'A_SHARE'
  category?: string
  manager?: string
  trackingIndex?: string
  benchmark?: string
  latestPrice: number
  latestNav?: number
  fundScale?: number
  priceHistory: HistoricalPricePoint[]
  dividendEvents: DividendEvent[]
  dataSource: 'eastmoney'
}

export interface FundDetailDataSource {
  getDetail(code: string, assetType: Extract<AssetType, 'ETF' | 'FUND'>): Promise<FundDetailSource>
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
