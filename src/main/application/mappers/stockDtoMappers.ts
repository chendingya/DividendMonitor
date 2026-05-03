import type {
  AssetCapabilitiesDto,
  AssetComparisonRowDto,
  AssetDetailDto,
  AssetSearchItemDto,
  AssetType,
  ComparisonRowDto,
  FutureYieldResponseDto,
  HistoricalYieldResponseDto,
  IndexValuationDto,
  WatchlistEntryDto,
  StockDetailDto,
  StockSearchItemDto
} from '@shared/contracts/api'
import { buildAssetKey, buildStockAssetKey } from '@shared/contracts/api'
import { buildHistoricalYields, NATURAL_YEAR_YIELD_BASIS } from '@main/domain/services/dividendYieldService'
import { estimateFutureYield, estimateFundFutureYield } from '@main/domain/services/futureYieldEstimator'
import { calculateRiskMetrics } from '@main/domain/services/riskMetricsService'
import { buildValuationWindows } from '@main/domain/services/valuationService'
import type { AssetSearchSource, FundAssetDetailSource, StockAssetDetailSource } from '@main/repositories/assetProviderRegistry'
import type { IndexValuationSource } from '@main/repositories/indexValuationRepository'

const FUND_YIELD_BASIS =
  'Event-level yield accumulation by distribution year, using per-share cash distribution divided by the close on or before the record date'

const STOCK_CAPABILITIES: AssetCapabilitiesDto = {
  hasIncomeAnalysis: true,
  hasValuationAnalysis: true,
  hasBacktest: true,
  hasComparisonMetrics: true
}

const ETF_FUND_CAPABILITIES: AssetCapabilitiesDto = {
  hasIncomeAnalysis: true,
  hasValuationAnalysis: false,
  hasBacktest: true,
  hasComparisonMetrics: true
}

function deriveCapabilities(kind: 'STOCK' | 'ETF' | 'FUND'): AssetCapabilitiesDto {
  return kind === 'STOCK' ? STOCK_CAPABILITIES : ETF_FUND_CAPABILITIES
}

function toValuationMetricDto(metric?: Parameters<typeof buildValuationWindows>[0]) {
  if (!metric) {
    return undefined
  }

  const windows = buildValuationWindows(metric)
  return {
    ...windows,
    history: metric.history.map((point) => ({
      date: point.date,
      value: point.value
    }))
  }
}

function createUnavailableEstimate(assetType: AssetType) {
  return {
    estimatedDividendPerShare: 0,
    estimatedFutureYield: 0,
    method: 'baseline' as const,
    isAvailable: false,
    reason: `${assetType} 暂不提供未来股息率估算`,
    inputs: {},
    steps: ['当前仅对股票提供未来股息率估算。']
  }
}

export function assertStockSearchItem(item: AssetSearchSource): StockSearchItemDto {
  if (item.assetType !== 'STOCK' || !item.symbol) {
    throw new Error(`Expected STOCK search item but received ${item.assetType}:${item.code}`)
  }

  return {
    assetKey: buildStockAssetKey(item.code),
    assetType: 'STOCK',
    market: item.market,
    code: item.code,
    symbol: item.symbol,
    name: item.name
  }
}

export function toAssetSearchItemDto(item: AssetSearchSource): AssetSearchItemDto {
  if (item.assetType === 'STOCK' && item.symbol) {
    return assertStockSearchItem(item)
  }

  return {
    assetKey: `${item.assetType}:${item.market}:${item.code}`,
    assetType: item.assetType,
    market: item.market,
    code: item.code,
    symbol: item.symbol,
    name: item.name
  }
}

export function assertStockDetailSource(source: { kind: string }): asserts source is StockAssetDetailSource {
  if (source.kind !== 'STOCK') {
    throw new Error(`Expected STOCK detail source but received ${source.kind}`)
  }
}

export function assertFundDetailSource(source: { kind: string }): asserts source is FundAssetDetailSource {
  if (source.kind !== 'ETF' && source.kind !== 'FUND') {
    throw new Error(`Expected ETF/FUND detail source but received ${source.kind}`)
  }
}

export function toStockDetailDto(source: StockAssetDetailSource): StockDetailDto {
  const yearlyYields = buildHistoricalYields(source.dividendEvents)
  const estimates = estimateFutureYield({
    latestPrice: source.stock.latestPrice,
    latestTotalShares: source.latestTotalShares,
    latestAnnualNetProfit: source.latestAnnualNetProfit,
    lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
    lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
  })

  const valuationDto = {
    pe: toValuationMetricDto(source.valuation?.pe),
    pb: toValuationMetricDto(source.valuation?.pb)
  }

  const riskMetrics = calculateRiskMetrics(source.priceHistory)

  return {
    assetKey: buildStockAssetKey(source.stock.symbol),
    assetType: 'STOCK',
    code: source.stock.symbol,
    symbol: source.stock.symbol,
    name: source.stock.name,
    market: source.stock.market,
    industry: source.stock.industry,
    latestPrice: source.stock.latestPrice,
    marketCap: source.stock.marketCap,
    peRatio: source.stock.peRatio,
    pbRatio: source.stock.pbRatio,
    roe: source.stock.roe,
    totalShares: source.stock.totalShares,
    dataSource: source.dataSource,
    yieldBasis: NATURAL_YEAR_YIELD_BASIS,
    yearlyYields,
    dividendEvents: source.dividendEvents,
    futureYieldEstimate: estimates.baseline,
    futureYieldEstimates: [estimates.baseline, estimates.conservative],
    valuation: valuationDto,
    annualVolatility: riskMetrics?.annualVolatility,
    sharpeRatio: riskMetrics?.sharpeRatio,
    capabilities: STOCK_CAPABILITIES,
    modules: {
      income: {
        yieldBasis: NATURAL_YEAR_YIELD_BASIS,
        yearlyYields,
        dividendEvents: source.dividendEvents,
        futureYieldEstimate: estimates.baseline,
        futureYieldEstimates: [estimates.baseline, estimates.conservative]
      },
      valuation: valuationDto,
      equity: {
        industry: source.stock.industry,
        marketCap: source.stock.marketCap,
        peRatio: source.stock.peRatio,
        pbRatio: source.stock.pbRatio,
        roe: source.stock.roe,
        totalShares: source.stock.totalShares
      },
      risk: riskMetrics
    }
  }
}

function toIndexValuationDto(source?: IndexValuationSource): IndexValuationDto | undefined {
  if (!source) return undefined

  return {
    indexCode: source.indexCode,
    indexName: source.indexName,
    source: source.source,
    pe: toValuationMetricDto(source.pe),
    pb: toValuationMetricDto(source.pb),
    hasHistory: source.hasHistory
  }
}

export function toAssetDetailDto(source: StockAssetDetailSource | FundAssetDetailSource, indexValuation?: IndexValuationSource): AssetDetailDto {
  if (source.kind === 'STOCK') {
    return toStockDetailDto(source)
  }

  const yearlyYields = buildHistoricalYields(source.dividendEvents)
  const indexValuationDto = indexValuation ? toIndexValuationDto(indexValuation) : undefined
  const caps = indexValuationDto
    ? { ...deriveCapabilities(source.kind), hasValuationAnalysis: true }
    : deriveCapabilities(source.kind)
  const assetKey = buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code)

  const estimates = source.dividendEvents.length > 0
    ? estimateFundFutureYield({
        latestPrice: source.latestPrice,
        dividendEvents: source.dividendEvents
      })
    : null

  const riskMetrics = calculateRiskMetrics(source.priceHistory)
  const futureYieldEstimate =
    estimates?.baseline ?? createUnavailableEstimate(source.identifier.assetType)
  const futureYieldEstimates = estimates
    ? [estimates.baseline, estimates.conservative]
    : [createUnavailableEstimate(source.identifier.assetType)]

  return {
    assetKey,
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    name: source.name,
    category: source.category,
    manager: source.manager,
    trackingIndex: source.trackingIndex,
    benchmark: source.benchmark,
    latestNav: source.latestNav,
    fundScale: source.fundScale,
    latestPrice: source.latestPrice,
    dataSource: source.dataSource,
    yieldBasis: FUND_YIELD_BASIS,
    yearlyYields,
    dividendEvents: source.dividendEvents,
    futureYieldEstimate,
    futureYieldEstimates,
    annualVolatility: riskMetrics?.annualVolatility,
    sharpeRatio: riskMetrics?.sharpeRatio,
    capabilities: caps,
    modules: {
      income: {
        yieldBasis: FUND_YIELD_BASIS,
        yearlyYields,
        dividendEvents: source.dividendEvents,
        futureYieldEstimate,
        futureYieldEstimates
      },
      fund: {
        category: source.category,
        manager: source.manager,
        trackingIndex: source.trackingIndex,
        benchmark: source.benchmark,
        latestNav: source.latestNav,
        fundScale: source.fundScale
      },
      risk: riskMetrics,
      indexValuation: indexValuationDto
    }
  }
}

export function toStockComparisonRowDto(source: StockAssetDetailSource): ComparisonRowDto {
  const yearlyYields = buildHistoricalYields(source.dividendEvents)
  const estimates = estimateFutureYield({
    latestPrice: source.stock.latestPrice,
    latestTotalShares: source.latestTotalShares,
    latestAnnualNetProfit: source.latestAnnualNetProfit,
    lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
    lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
  })
  const averageYield = yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(yearlyYields.length, 1)
  const riskMetrics = calculateRiskMetrics(source.priceHistory)

  return {
    assetKey: buildStockAssetKey(source.stock.symbol),
    assetType: 'STOCK',
    market: source.stock.market,
    code: source.stock.symbol,
    symbol: source.stock.symbol,
    name: source.stock.name,
    industry: source.stock.industry,
    latestPrice: source.stock.latestPrice,
    marketCap: source.stock.marketCap,
    peRatio: source.stock.peRatio,
    pbRatio: source.stock.pbRatio,
    roe: source.stock.roe,
    averageYield,
    estimatedFutureYield: estimates.baseline.estimatedFutureYield,
    annualVolatility: riskMetrics?.annualVolatility,
    sharpeRatio: riskMetrics?.sharpeRatio,
    valuation: {
      pe: toValuationMetricDto(source.valuation?.pe),
      pb: toValuationMetricDto(source.valuation?.pb)
    }
  }
}

export function toAssetComparisonRowDto(source: StockAssetDetailSource | FundAssetDetailSource, indexValuation?: IndexValuationSource): AssetComparisonRowDto {
  if (source.kind === 'STOCK') {
    return toStockComparisonRowDto(source)
  }

  const yearlyYields = buildHistoricalYields(source.dividendEvents)
  const averageYield = yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(yearlyYields.length, 1)
  const estimates = source.dividendEvents.length > 0
    ? estimateFundFutureYield({
        latestPrice: source.latestPrice,
        dividendEvents: source.dividendEvents
      })
    : null
  const riskMetrics = calculateRiskMetrics(source.priceHistory)

  return {
    assetKey: buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code),
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    name: source.name,
    latestPrice: source.latestPrice,
    marketCap: source.fundScale,
    peRatio: indexValuation?.pe?.currentValue,
    pbRatio: indexValuation?.pb?.currentValue,
    averageYield: yearlyYields.length > 0 ? averageYield : undefined,
    estimatedFutureYield: estimates?.baseline.isAvailable
      ? estimates.baseline.estimatedFutureYield
      : undefined,
    annualVolatility: riskMetrics?.annualVolatility,
    sharpeRatio: riskMetrics?.sharpeRatio
  }
}

export function toWatchlistEntryDto(source: StockAssetDetailSource | FundAssetDetailSource): WatchlistEntryDto {
  if (source.kind === 'STOCK') {
    const estimates = estimateFutureYield({
      latestPrice: source.stock.latestPrice,
      latestTotalShares: source.latestTotalShares,
      latestAnnualNetProfit: source.latestAnnualNetProfit,
      lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
      lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
    })

    return {
      assetKey: buildStockAssetKey(source.stock.symbol),
      assetType: 'STOCK',
      code: source.stock.symbol,
      symbol: source.stock.symbol,
      name: source.stock.name,
      market: source.stock.market,
      latestPrice: source.stock.latestPrice,
      peRatio: source.stock.peRatio,
      estimatedFutureYield: estimates.baseline.estimatedFutureYield,
      yieldLabel: '预期股息率'
    }
  }

  const yearlyYields = buildHistoricalYields(source.dividendEvents)
  const averageYield = yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(yearlyYields.length, 1)
  const estimates = source.dividendEvents.length > 0
    ? estimateFundFutureYield({
        latestPrice: source.latestPrice,
        dividendEvents: source.dividendEvents
      })
    : null

  return {
    assetKey: buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code),
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    name: source.name,
    latestPrice: source.latestPrice,
    averageYield: yearlyYields.length > 0 ? averageYield : undefined,
    estimatedFutureYield: estimates?.baseline.isAvailable
      ? estimates.baseline.estimatedFutureYield
      : undefined,
    yieldLabel: estimates?.baseline.isAvailable ? '预期分配收益率' : '历史分配收益率'
  }
}

export function toHistoricalYieldResponseDto(source: StockAssetDetailSource | FundAssetDetailSource): HistoricalYieldResponseDto {
  if (source.kind === 'STOCK') {
    return {
      assetKey: buildStockAssetKey(source.stock.symbol),
      assetType: 'STOCK',
      market: source.stock.market,
      code: source.stock.symbol,
      symbol: source.stock.symbol,
      basis: NATURAL_YEAR_YIELD_BASIS,
      yearlyYields: buildHistoricalYields(source.dividendEvents),
      dividendEvents: source.dividendEvents
    }
  }

  return {
    assetKey: buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code),
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    symbol: source.identifier.code,
    basis: FUND_YIELD_BASIS,
    yearlyYields: buildHistoricalYields(source.dividendEvents),
    dividendEvents: source.dividendEvents
  }
}

export function toFutureYieldResponseDto(source: StockAssetDetailSource | FundAssetDetailSource): FutureYieldResponseDto {
  if (source.kind === 'STOCK') {
    const estimates = estimateFutureYield({
      latestPrice: source.stock.latestPrice,
      latestTotalShares: source.latestTotalShares,
      latestAnnualNetProfit: source.latestAnnualNetProfit,
      lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
      lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
    })

    return {
      assetKey: buildStockAssetKey(source.stock.symbol),
      assetType: 'STOCK',
      market: source.stock.market,
      code: source.stock.symbol,
      symbol: source.stock.symbol,
      estimates: [estimates.baseline, estimates.conservative]
    }
  }

  const estimates = source.dividendEvents.length > 0
    ? estimateFundFutureYield({
        latestPrice: source.latestPrice,
        dividendEvents: source.dividendEvents
      })
    : null

  return {
    assetKey: buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code),
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    symbol: source.identifier.code,
    estimates: estimates
      ? [estimates.baseline, estimates.conservative]
      : [createUnavailableEstimate(source.identifier.assetType)]
  }
}
