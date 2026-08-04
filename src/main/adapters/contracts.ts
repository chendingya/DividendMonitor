import type { HistoricalPricePoint, Stock, DividendEvent } from '@main/domain/entities/Stock'
import type { ValuationMetric, ValuationTrendPoint } from '@main/domain/services/valuationService'
import type { AssetType } from '@shared/contracts/api'
import type { MarketQuoteRecord, MarketDividendRecord } from '@main/infrastructure/dataSources/types/sourceTypes'
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

export type PreciousMetalSearchSource = {
  assetType: Extract<AssetType, 'GOLD' | 'SILVER'>
  code: string
  name: string
  market: 'SGE'
  purity?: string
}

export type PreciousMetalDetailSource = {
  assetType: Extract<AssetType, 'GOLD' | 'SILVER'>
  code: string
  name: string
  market: 'SGE'
  purity?: string
  exchangeName: string
  latestPrice: number
  internationalPriceUsdPerOz?: number
  priceHistory: HistoricalPricePoint[]
  dividendEvents: DividendEvent[]
  dataSource: 'eastmoney'
}

export interface PreciousMetalDataSource {
  search(keyword: string): Promise<PreciousMetalSearchSource[]>
  getDetail(code: string, assetType: Extract<AssetType, 'GOLD' | 'SILVER'>): Promise<PreciousMetalDetailSource>
  compare(codes: string[], assetType: Extract<AssetType, 'GOLD' | 'SILVER'>): Promise<PreciousMetalDetailSource[]>
}

export type FxRateSource = {
  pair: string
  rate: number
  name?: string
  fetchedAt: string
}

export interface FxDataSource {
  getRate(pair: string): Promise<FxRateSource>
}

// ====== Housing price index ======

export type HousingPriceIndexRecord = {
  reportDate: string        // YYYY-MM
  city: string
  newHomeMoM?: number       // 新建住宅环比（上月=100）
  newHomeYoY?: number       // 新建住宅同比（上年同月=100）
  secondHandMoM?: number    // 二手住宅环比（上月=100）
  secondHandYoY?: number    // 二手住宅同比（上年同月=100）
}

export interface HousingDataSource {
  /** 某月全 70 城指数快照（不带参数默认最新月份） */
  getLatestSnapshot(period?: string): Promise<HousingPriceIndexRecord[]>
  /** 单城全部历史指数（2011 至今） */
  getCityHistory(city: string): Promise<HousingPriceIndexRecord[]>
  /** 多城历史区间指数 */
  getRange(periods: Array<{ city: string; period?: string }>): Promise<HousingPriceIndexRecord[]>
}

// ====== Housing absolute price / rent (中指研究院) ======

export type HousingCityMarketSnapshot = {
  city: string
  pricePerSqm?: number          // 样本均价/租金（元/㎡ 或 元/㎡·月，按 type 而定）
  medianPerSqm?: number
  momPercent?: number           // 环比涨跌幅（%）
  yoyPercent?: number           // 同比涨跌幅（%）
}

export type HousingMarketTrendPoint = {
  period: string                // YYYY-MM
  pricePerSqm?: number
  momPercent?: number
  yoyPercent?: number
}

export type HousingMarketSnapshot = {
  type: 'newHouse' | 'esfHouse' | 'rentIndex'
  period: string                // 最新数据期，如 2026-07
  unit: string
  nationalAverage?: number
  nationalMedian?: number
  nationalMomPercent?: number
  nationalYoyPercent?: number
  cities: HousingCityMarketSnapshot[]
  trend: HousingMarketTrendPoint[]
}

export interface HousingMarketDataSource {
  /** 百城新建住宅样本均价快照 */
  getNewHouseSnapshot(): Promise<HousingMarketSnapshot>
  /** 百城二手住宅样本均价快照 */
  getEsfHouseSnapshot(): Promise<HousingMarketSnapshot>
  /** 50 城住宅租金快照（元/㎡·月） */
  getRentSnapshot(): Promise<HousingMarketSnapshot>
}

export interface YieldMapDataSource {
  fetchAllQuotes(): Promise<MarketQuoteRecord[]>
  fetchAllDividendEvents(): Promise<MarketDividendRecord[]>
}
