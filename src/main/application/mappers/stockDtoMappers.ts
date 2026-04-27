import type {
  AssetCapabilitiesDto,
  AssetComparisonRowDto,
  AssetDetailDto,
  AssetSearchItemDto,
  AssetType,
  ComparisonRowDto,
  FutureYieldResponseDto,
  HistoricalYieldResponseDto,
  WatchlistEntryDto,
  StockDetailDto,
  StockSearchItemDto
} from '@shared/contracts/api'
import { buildAssetKey, buildStockAssetKey } from '@shared/contracts/api'
import { buildHistoricalYields, NATURAL_YEAR_YIELD_BASIS } from '@main/domain/services/dividendYieldService'
import { estimateFutureYield } from '@main/domain/services/futureYieldEstimator'
import { buildValuationWindows } from '@main/domain/services/valuationService'
import type { AssetSearchSource, FundAssetDetailSource, StockAssetDetailSource } from '@main/repositories/assetProviderRegistry'

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
    totalShares: source.stock.totalShares,
    dataSource: source.dataSource,
    yieldBasis: NATURAL_YEAR_YIELD_BASIS,
    yearlyYields,
    dividendEvents: source.dividendEvents,
    futureYieldEstimate: estimates.baseline,
    futureYieldEstimates: [estimates.baseline, estimates.conservative],
    valuation: valuationDto,
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
        totalShares: source.stock.totalShares
      }
    }
  }
}

export function toAssetDetailDto(source: StockAssetDetailSource | FundAssetDetailSource): AssetDetailDto {
  if (source.kind === 'STOCK') {
    return toStockDetailDto(source)
  }

  const yearlyYields = buildHistoricalYields(source.dividendEvents)
  const unavailableEstimate = createUnavailableEstimate(source.identifier.assetType)
  const caps = deriveCapabilities(source.kind)
  const assetKey = buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code)

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
    futureYieldEstimate: unavailableEstimate,
    futureYieldEstimates: [unavailableEstimate],
    capabilities: caps,
    modules: {
      income: {
        yieldBasis: FUND_YIELD_BASIS,
        yearlyYields,
        dividendEvents: source.dividendEvents,
        futureYieldEstimate: unavailableEstimate,
        futureYieldEstimates: [unavailableEstimate]
      },
      fund: {
        category: source.category,
        manager: source.manager,
        trackingIndex: source.trackingIndex,
        benchmark: source.benchmark,
        latestNav: source.latestNav,
        fundScale: source.fundScale
      }
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

  return {
    assetKey: buildStockAssetKey(source.stock.symbol),
    assetType: 'STOCK',
    market: source.stock.market,
    code: source.stock.symbol,
    symbol: source.stock.symbol,
    name: source.stock.name,
    latestPrice: source.stock.latestPrice,
    marketCap: source.stock.marketCap,
    peRatio: source.stock.peRatio,
    pbRatio: source.stock.pbRatio,
    averageYield,
    estimatedFutureYield: estimates.baseline.estimatedFutureYield,
    valuation: {
      pe: toValuationMetricDto(source.valuation?.pe),
      pb: toValuationMetricDto(source.valuation?.pb)
    }
  }
}

export function toAssetComparisonRowDto(source: StockAssetDetailSource | FundAssetDetailSource): AssetComparisonRowDto {
  if (source.kind === 'STOCK') {
    return toStockComparisonRowDto(source)
  }

  const yearlyYields = buildHistoricalYields(source.dividendEvents)
  const averageYield = yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(yearlyYields.length, 1)

  return {
    assetKey: buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code),
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    name: source.name,
    latestPrice: source.latestPrice,
    marketCap: source.fundScale,
    averageYield: yearlyYields.length > 0 ? averageYield : undefined
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

  return {
    assetKey: buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code),
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    name: source.name,
    latestPrice: source.latestPrice,
    averageYield: yearlyYields.length > 0 ? averageYield : undefined,
    yieldLabel: '历史分配收益率'
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

  return {
    assetKey: buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code),
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    symbol: source.identifier.code,
    estimates: [createUnavailableEstimate(source.identifier.assetType)]
  }
}
