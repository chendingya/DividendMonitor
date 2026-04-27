export type AssetType = 'STOCK' | 'ETF' | 'FUND'

export type MarketCode = 'A_SHARE'

export type AssetKey = string

export type AssetIdentifierDto = {
  assetType: AssetType
  market: MarketCode
  code: string
}

export type AssetQueryDto = {
  assetKey?: AssetKey
  assetType?: AssetType
  market?: MarketCode
  code?: string
  symbol?: string
}

export type AssetSearchRequestDto = {
  keyword: string
  assetTypes?: AssetType[]
}

export type AssetCompareRequestDto = {
  items: AssetQueryDto[]
}

export type WatchlistAddRequestDto = AssetQueryDto & {
  name?: string
}

export type AssetBacktestRequestDto = {
  asset: AssetQueryDto
  buyDate: string
}

export type PortfolioDirectionDto = 'BUY' | 'SELL'

export type PortfolioPositionDto = {
  id: string
  assetKey: AssetKey
  assetType: AssetType
  market: MarketCode
  code: string
  symbol?: string
  name: string
  direction: PortfolioDirectionDto
  shares: number
  avgCost: number
  updatedAt: string
  createdAt: string
}

export type PortfolioPositionUpsertDto = {
  id?: string
  assetKey?: AssetKey
  assetType?: AssetType
  market?: MarketCode
  code?: string
  symbol?: string
  name: string
  direction?: PortfolioDirectionDto
  shares: number
  avgCost: number
}

export type PortfolioPositionReplaceByAssetDto = {
  asset: AssetQueryDto
  name: string
  shares: number
  avgCost: number
}

export const LOCAL_HTTP_API_ORIGIN = 'http://127.0.0.1:3210'

export function normalizeAssetCode(code: string) {
  return code.trim()
}

export function buildAssetKey(assetType: AssetType, market: MarketCode, code: string): AssetKey {
  return `${assetType}:${market}:${normalizeAssetCode(code)}`
}

export function buildStockAssetKey(symbol: string): AssetKey {
  return buildAssetKey('STOCK', 'A_SHARE', symbol)
}

export function parseAssetKey(assetKey: string): AssetIdentifierDto | null {
  const normalized = assetKey.trim()
  if (!normalized) {
    return null
  }

  const [assetType, market, ...codeParts] = normalized.split(':')
  const code = codeParts.join(':').trim()
  if (!assetType || !market || !code) {
    return null
  }

  if (!['STOCK', 'ETF', 'FUND'].includes(assetType)) {
    return null
  }

  if (market !== 'A_SHARE') {
    return null
  }

  return {
    assetType: assetType as AssetType,
    market: market as MarketCode,
    code: normalizeAssetCode(code)
  }
}

export function createStockAssetQuery(symbol: string): AssetQueryDto {
  const normalized = normalizeAssetCode(symbol)
  return {
    assetKey: buildStockAssetKey(normalized),
    assetType: 'STOCK',
    market: 'A_SHARE',
    code: normalized,
    symbol: normalized
  }
}

export function createAssetQuery(assetType: AssetType, code: string, market: MarketCode = 'A_SHARE'): AssetQueryDto {
  const normalized = normalizeAssetCode(code)
  return {
    assetKey: buildAssetKey(assetType, market, normalized),
    assetType,
    market,
    code: normalized,
    symbol: assetType === 'STOCK' ? normalized : undefined
  }
}

export function resolveAssetQuery(query: AssetQueryDto): AssetIdentifierDto {
  if (query.assetKey) {
    const parsed = parseAssetKey(query.assetKey)
    if (parsed) {
      return parsed
    }
    throw new Error(`Invalid assetKey: ${query.assetKey}`)
  }

  const assetType = query.assetType ?? (query.symbol ? 'STOCK' : undefined)
  const market = query.market ?? (query.symbol ? 'A_SHARE' : undefined)
  const code = query.code ?? query.symbol

  if (!assetType || !market || !code) {
    throw new Error('Asset query is missing asset identity fields.')
  }

  return {
    assetType,
    market,
    code: normalizeAssetCode(code)
  }
}

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

export type ValuationWindowKeyDto = '10Y' | '20Y'

export type ValuationWindowDto = {
  window: ValuationWindowKeyDto
  percentile?: number
  p30?: number
  p50?: number
  p70?: number
  sampleSize: number
}

export type ValuationTrendPointDto = {
  date: string
  value: number
}

export type ValuationMetricDto = {
  currentValue?: number
  currentPercentile?: number
  status?: string
  windows: ValuationWindowDto[]
  history?: ValuationTrendPointDto[]
}

export type ValuationSnapshotDto = {
  pe?: ValuationMetricDto
  pb?: ValuationMetricDto
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

export type AssetSearchItemDto = {
  assetKey: AssetKey
  assetType: AssetType
  market: MarketCode
  code: string
  name: string
  symbol?: string
}

export type WatchlistEntryDto = {
  assetKey: AssetKey
  assetType: AssetType
  market: MarketCode
  code: string
  symbol?: string
  name: string
  latestPrice: number
  peRatio?: number
  estimatedFutureYield?: number
  averageYield?: number
  yieldLabel?: string
}

export type AssetComparisonRowDto = {
  assetKey: AssetKey
  assetType: AssetType
  market: MarketCode
  code: string
  symbol?: string
  name: string
  latestPrice: number
  marketCap?: number
  peRatio?: number
  pbRatio?: number
  averageYield?: number
  estimatedFutureYield?: number
  valuation?: ValuationSnapshotDto
}

export type AssetCapabilitiesDto = {
  hasIncomeAnalysis: boolean
  hasValuationAnalysis: boolean
  hasBacktest: boolean
  hasComparisonMetrics: boolean
}

export type IncomeAnalysisDto = {
  yieldBasis: string
  yearlyYields: HistoricalYieldPointDto[]
  dividendEvents: DividendEventDto[]
  futureYieldEstimate: FutureYieldEstimateDto
  futureYieldEstimates: FutureYieldEstimateDto[]
}

export type EquityAssetModuleDto = {
  industry?: string
  marketCap?: number
  peRatio?: number
  pbRatio?: number
  totalShares?: number
}

export type FundAssetModuleDto = {
  category?: string
  manager?: string
  trackingIndex?: string
  benchmark?: string
  latestNav?: number
  fundScale?: number
}

export type AssetDetailModulesDto = {
  income?: IncomeAnalysisDto
  valuation?: ValuationSnapshotDto
  equity?: EquityAssetModuleDto
  fund?: FundAssetModuleDto
}

export type AssetDetailDto = {
  assetKey: AssetKey
  assetType: AssetType
  market: MarketCode
  code: string
  symbol?: string
  name: string
  industry?: string
  category?: string
  manager?: string
  trackingIndex?: string
  benchmark?: string
  latestNav?: number
  fundScale?: number
  latestPrice: number
  marketCap?: number
  peRatio?: number
  pbRatio?: number
  totalShares?: number
  dataSource: 'mock' | 'eastmoney'
  yieldBasis: string
  yearlyYields: HistoricalYieldPointDto[]
  dividendEvents: DividendEventDto[]
  futureYieldEstimate: FutureYieldEstimateDto
  futureYieldEstimates: FutureYieldEstimateDto[]
  valuation?: ValuationSnapshotDto
  capabilities: AssetCapabilitiesDto
  modules: AssetDetailModulesDto
}

export type HistoricalYieldResponseDto = {
  assetKey?: AssetKey
  assetType?: AssetType
  market?: MarketCode
  code?: string
  symbol: string
  basis: string
  yearlyYields: HistoricalYieldPointDto[]
  dividendEvents: DividendEventDto[]
}

export type FutureYieldResponseDto = {
  assetKey?: AssetKey
  assetType?: AssetType
  market?: MarketCode
  code?: string
  symbol: string
  estimates: FutureYieldEstimateDto[]
}

export type BacktestResultDto = {
  assetKey?: AssetKey
  assetType?: AssetType
  market?: MarketCode
  code?: string
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

export type StockSearchItemDto = AssetSearchItemDto & {
  assetType: 'STOCK'
  symbol: string
}

export type WatchlistItemDto = WatchlistEntryDto & {
  assetType: 'STOCK'
  symbol: string
}

export type ComparisonRowDto = AssetComparisonRowDto & {
  assetType: 'STOCK'
  symbol: string
}

export type StockDetailDto = AssetDetailDto & {
  assetType: 'STOCK'
  symbol: string
}

export interface DividendMonitorApi {
  asset: {
    search(request: AssetSearchRequestDto): Promise<AssetSearchItemDto[]>
    getDetail(request: AssetQueryDto): Promise<AssetDetailDto>
    compare(request: AssetCompareRequestDto): Promise<AssetComparisonRowDto[]>
  }
  stock: {
    search(keyword: string): Promise<StockSearchItemDto[]>
    getDetail(symbol: string): Promise<StockDetailDto>
    compare(symbols: string[]): Promise<ComparisonRowDto[]>
  }
  watchlist: {
    list(): Promise<WatchlistEntryDto[]>
    add(symbol: string): Promise<void>
    remove(symbol: string): Promise<void>
    addAsset(request: WatchlistAddRequestDto): Promise<void>
    removeAsset(assetKey: AssetKey): Promise<void>
  }
  calculation: {
    getHistoricalYield(symbol: string): Promise<HistoricalYieldResponseDto>
    estimateFutureYield(symbol: string): Promise<FutureYieldResponseDto>
    runDividendReinvestmentBacktest(symbol: string, buyDate: string): Promise<BacktestResultDto>
    getHistoricalYieldForAsset(request: AssetQueryDto): Promise<HistoricalYieldResponseDto>
    estimateFutureYieldForAsset(request: AssetQueryDto): Promise<FutureYieldResponseDto>
    runDividendReinvestmentBacktestForAsset(request: AssetBacktestRequestDto): Promise<BacktestResultDto>
  }
  portfolio: {
    list(): Promise<PortfolioPositionDto[]>
    upsert(request: PortfolioPositionUpsertDto): Promise<void>
    remove(id: string): Promise<void>
    removeByAsset(request: AssetQueryDto): Promise<void>
    replaceByAsset(request: PortfolioPositionReplaceByAssetDto): Promise<void>
  }
}

declare global {
  interface Window {
    dividendMonitor: DividendMonitorApi
  }
}
