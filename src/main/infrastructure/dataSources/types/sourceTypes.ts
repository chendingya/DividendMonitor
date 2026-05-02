import type { HistoricalPricePoint, DividendEvent } from '@main/domain/entities/Stock'
import type { AssetType } from '@shared/contracts/api'

export type ProviderKey = 'eastmoney' | 'tencent' | 'sina'

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

export type DegradeMode = 'strict' | 'fallback' | 'stale-while-error'

export type ParserKind = 'json' | 'text' | 'gbk'

export type RouteContext = {
  assetType?: AssetType
  market?: 'A_SHARE'
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
