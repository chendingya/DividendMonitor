import type { HistoricalPricePoint, DividendEvent } from '@main/domain/entities/Stock'
import type { AssetType } from '@shared/contracts/api'

export type ProviderKey = 'eastmoney' | 'tencent' | 'sina' | 'cih'

export type Capability =
  | 'asset.search'
  | 'asset.profile'
  | 'asset.quote'
  | 'asset.dividend'
  | 'asset.kline'
  | 'valuation.snapshot'
  | 'valuation.percentile'
  | 'valuation.trend'
  | 'benchmark.kline'
  | 'fx.quote'
  | 'housing.priceIndex'
  | 'housing.marketSnapshot'

export type DegradeMode = 'strict' | 'fallback' | 'stale-while-error'

export type ParserKind = 'json' | 'text' | 'gbk'

export type RouteContext = {
  assetType?: AssetType
  market?: 'A_SHARE' | 'SGE'
  code?: string
}

export type EndpointDefinition<TInput = unknown, TRaw = unknown, TOutput = unknown> = {
  id: string
  provider: ProviderKey
  capability: Capability
  parser: ParserKind
  method: 'GET'
  timeoutMs: number
  headers?: Record<string, string>
  buildUrl: (input: TInput) => string
  mapResponse: (raw: TRaw, input: TInput) => TOutput
}

export type SourceRequest<TInput> = {
  capability: Capability
  input: TInput
  routeContext?: RouteContext
  providerHint?: ProviderKey
  fallbackProviders?: ProviderKey[]
  degradeMode?: DegradeMode
  cacheKey?: string
  cacheTtlMs?: number
  staleTtlMs?: number
  tags?: string[]
}

export type SourceResponse<TData> = {
  data: TData
  provider: ProviderKey
  endpointId: string
  isFallback: boolean
  isStale: boolean
  fetchedAt: string
}

export type RoutePlan = {
  primary: ProviderKey
  fallbacks: ProviderKey[]
  degradeMode: DegradeMode
}

export type RequestPolicy = {
  retryCount: number
  timeoutMs?: number
  degradeMode: DegradeMode
  useInFlightDedupe: boolean
  useCircuitBreaker: boolean
  useRateLimit: boolean
  cacheTtlMs?: number
  staleTtlMs?: number
}

export type BenchmarkKlineInput = {
  benchmarkSymbol: string
}

export type SearchSuggestInput = {
  keyword: string
  count: number
}

export type BenchmarkKlineOutput = HistoricalPricePoint[]

// ====== Dividend capability types ======

export type StockDividendRecord = {
  SECURITY_CODE?: string
  SECURITY_NAME_ABBR?: string
  REPORT_DATE?: string
  PLAN_NOTICE_DATE?: string
  EQUITY_RECORD_DATE?: string
  EX_DIVIDEND_DATE?: string
  NOTICE_DATE?: string
  PRETAX_BONUS_RMB?: number
  TOTAL_SHARES?: number
  BASIC_EPS?: number
  BONUS_RATIO?: number
  BONUS_IT_RATIO?: number
  DIVIDENT_RATIO?: number
  ASSIGN_PROGRESS?: string
}

export type AssetDividendInput = {
  code: string
  priceHistory?: HistoricalPricePoint[]
  fallbackPrice?: number
}

export type AssetDividendOutput = {
  records: StockDividendRecord[]
  events: DividendEvent[]
}

// ====== Profile capability types ======

export type AssetProfileInput = {
  code: string
}

export type AssetProfileOutput = {
  name?: string
  industry?: string
  category?: string
  manager?: string
  trackingIndex?: string
  benchmark?: string
  latestNav?: number
  fundScale?: number
}

// ====== Valuation snapshot capability types ======

export type ValuationSnapshotInput = {
  code: string
}

export type ValuationSnapshotOutput = {
  roe?: number
  industry?: string
}

// ====== Valuation percentile capability types ======

export type ValuationPercentileInput = {
  code: string
  indicatorType: 1 | 2  // 1=PE, 2=PB
}

export type ValuationPercentileOutput = {
  currentValue?: number
  currentPercentile?: number
  status?: string
}

// ====== Valuation trend capability types ======

export type ValuationTrendInput = {
  code: string
  indicatorType: 1 | 2  // 1=PE, 2=PB
}

export type ValuationTrendPoint = {
  date: string
  value: number
}

export type ValuationTrendOutput = ValuationTrendPoint[]

// ====== FX (foreign exchange) capability types ======

export type FxQuoteInput = {
  pair: string
}

export type FxQuoteOutput = {
  pair: string
  rate: number
  name?: string
  change?: number
  changePercent?: number
  fetchedAt: string
}

// ====== Housing price index capability types ======

export type HousingPriceIndexInput = {
  city?: string
  period?: string       // 精确月份 YYYY-MM，只取该月数据
  startDate?: string    // YYYY-MM 起
  endDate?: string      // YYYY-MM 止
}

export type HousingPriceIndexRecord = {
  reportDate: string        // YYYY-MM
  city: string
  newHomeMoM?: number       // 新建住宅环比（上月=100）
  newHomeYoY?: number       // 新建住宅同比（上年同月=100）
  secondHandMoM?: number    // 二手住宅环比（上月=100）
  secondHandYoY?: number    // 二手住宅同比（上年同月=100）
}

export type HousingPriceIndexOutput = {
  records: HousingPriceIndexRecord[]
  count: number
}

// ====== Housing market snapshot capability types (中指研究院) ======

export type HousingMarketSnapshotType = 'newHouse' | 'esfHouse' | 'rentIndex'

export type HousingMarketSnapshotInput = {
  type: HousingMarketSnapshotType
}

export type HousingCitySnapshot = {
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

export type HousingMarketSnapshotOutput = {
  type: HousingMarketSnapshotType
  period: string                // 最新数据期，如 2026-07
  unit: string                  // 如 元/平方米 或 元/平方米/月
  nationalAverage?: number      // 全国/百城平均
  nationalMedian?: number
  nationalMomPercent?: number
  nationalYoyPercent?: number
  cities: HousingCitySnapshot[]          // 全量城市明细
  trend: HousingMarketTrendPoint[]       // 全国历史趋势（近 12 个月）
}
