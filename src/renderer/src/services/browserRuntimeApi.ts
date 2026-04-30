import type {
  AssetBacktestRequestDto,
  AssetCompareRequestDto,
  AssetComparisonRowDto,
  AssetDetailDto,
  AssetQueryDto,
  AssetSearchItemDto,
  AssetSearchRequestDto,
  BacktestResultDto,
  DividendMonitorApi,
  FutureYieldResponseDto,
  HistoricalYieldResponseDto,
  WatchlistEntryDto,
  ComparisonRowDto,
  StockDetailDto,
  StockSearchItemDto,
  ValuationSnapshotDto
} from '@shared/contracts/api'
import { buildAssetKey, buildStockAssetKey, createStockAssetQuery, resolveAssetQuery } from '@shared/contracts/api'
import {
  readPortfolioPositions,
  removePortfolioPosition,
  removePortfolioPositionsBySymbol,
  replacePortfolioPositionsBySymbol,
  upsertPortfolioPosition
} from '@renderer/services/portfolioStore'

const WATCHLIST_STORAGE_KEY = 'dm:web-watchlist'

function buildMockValuation(
  peRatio: number | undefined,
  pbRatio: number | undefined,
  options: {
    pe10y: { percentile: number; p30: number; p50: number; p70: number }
    pe20y: { percentile: number; p30: number; p50: number; p70: number }
    pb10y: { percentile: number; p30: number; p50: number; p70: number }
    pb20y: { percentile: number; p30: number; p50: number; p70: number }
  }
): ValuationSnapshotDto {
  return {
    pe:
      peRatio == null
        ? undefined
        : {
            currentValue: peRatio,
            currentPercentile: options.pe10y.percentile,
            status: options.pe10y.percentile <= 30 ? '估值较低' : options.pe10y.percentile >= 70 ? '估值较高' : '估值中等',
            windows: [
              { window: '10Y', sampleSize: 520, ...options.pe10y },
              { window: '20Y', sampleSize: 1040, ...options.pe20y }
            ]
          },
    pb:
      pbRatio == null
        ? undefined
        : {
            currentValue: pbRatio,
            currentPercentile: options.pb10y.percentile,
            status: options.pb10y.percentile <= 30 ? '估值较低' : options.pb10y.percentile >= 70 ? '估值较高' : '估值中等',
            windows: [
              { window: '10Y', sampleSize: 520, ...options.pb10y },
              { window: '20Y', sampleSize: 1040, ...options.pb20y }
            ]
          }
  }
}

const STOCK_CAPABILITIES = {
  hasIncomeAnalysis: true,
  hasValuationAnalysis: true,
  hasBacktest: true,
  hasComparisonMetrics: true
} as const

const FUND_CAPABILITIES = {
  hasIncomeAnalysis: true,
  hasValuationAnalysis: false,
  hasBacktest: true,
  hasComparisonMetrics: true
} as const

type FlatDetailDto = Omit<AssetDetailDto, 'capabilities' | 'modules'>

function augmentStockMock(detail: FlatDetailDto): AssetDetailDto {
  return {
    ...detail,
    capabilities: STOCK_CAPABILITIES,
    modules: {
      income: {
        yieldBasis: detail.yieldBasis,
        yearlyYields: detail.yearlyYields,
        dividendEvents: detail.dividendEvents,
        futureYieldEstimate: detail.futureYieldEstimate,
        futureYieldEstimates: detail.futureYieldEstimates
      },
      valuation: detail.valuation,
      equity: {
        industry: detail.industry,
        marketCap: detail.marketCap,
        peRatio: detail.peRatio,
        pbRatio: detail.pbRatio,
        totalShares: detail.totalShares
      }
    }
  }
}

function augmentFundMock(detail: FlatDetailDto): AssetDetailDto {
  return {
    ...detail,
    capabilities: FUND_CAPABILITIES,
    modules: {
      income: {
        yieldBasis: detail.yieldBasis,
        yearlyYields: detail.yearlyYields,
        dividendEvents: detail.dividendEvents,
        futureYieldEstimate: detail.futureYieldEstimate,
        futureYieldEstimates: detail.futureYieldEstimates
      },
      fund: {
        category: detail.category,
        manager: detail.manager,
        trackingIndex: detail.trackingIndex,
        benchmark: detail.benchmark,
        latestNav: detail.latestNav,
        fundScale: detail.fundScale
      }
    }
  }
}

const mockStockDetails: Record<string, FlatDetailDto> = {
  '600519': {
    assetKey: buildStockAssetKey('600519'),
    assetType: 'STOCK',
    code: '600519',
    symbol: '600519',
    name: '贵州茅台',
    market: 'A_SHARE',
    industry: '白酒',
    latestPrice: 1688,
    marketCap: 2120000000000,
    peRatio: 24.6,
    pbRatio: 8.3,
    totalShares: 1256197800,
    dataSource: 'mock',
    yieldBasis: '浏览器预览模式下使用内置 mock 数据，口径仍按事件级股息率累加展示。',
    yearlyYields: [
      { year: 2020, yield: 0.0121, events: 1 },
      { year: 2021, yield: 0.0154, events: 1 },
      { year: 2022, yield: 0.0181, events: 1 },
      { year: 2023, yield: 0.0202, events: 1 },
      { year: 2024, yield: 0.0226, events: 1 }
    ],
    dividendEvents: [
      {
        year: 2020,
        fiscalYear: 2019,
        announceDate: '2020-05-28',
        recordDate: '2020-06-10',
        exDate: '2020-06-11',
        payDate: '2020-06-11',
        dividendPerShare: 17.025,
        payoutRatio: 0.51,
        referenceClosePrice: 1407,
        source: 'mock'
      },
      {
        year: 2021,
        fiscalYear: 2020,
        announceDate: '2021-05-28',
        recordDate: '2021-06-09',
        exDate: '2021-06-10',
        payDate: '2021-06-10',
        dividendPerShare: 19.293,
        payoutRatio: 0.52,
        referenceClosePrice: 1252,
        source: 'mock'
      },
      {
        year: 2022,
        fiscalYear: 2021,
        announceDate: '2022-06-01',
        recordDate: '2022-06-23',
        exDate: '2022-06-24',
        payDate: '2022-06-24',
        dividendPerShare: 21.675,
        payoutRatio: 0.53,
        referenceClosePrice: 1197,
        source: 'mock'
      },
      {
        year: 2023,
        fiscalYear: 2022,
        announceDate: '2023-05-30',
        recordDate: '2023-06-28',
        exDate: '2023-06-29',
        payDate: '2023-06-29',
        dividendPerShare: 25.911,
        payoutRatio: 0.54,
        referenceClosePrice: 1281,
        source: 'mock'
      },
      {
        year: 2024,
        fiscalYear: 2023,
        announceDate: '2024-05-29',
        recordDate: '2024-06-13',
        exDate: '2024-06-14',
        payDate: '2024-06-14',
        dividendPerShare: 30.876,
        payoutRatio: 0.56,
        referenceClosePrice: 1365,
        source: 'mock'
      }
    ],
    futureYieldEstimate: {
      estimatedDividendPerShare: 33.2,
      estimatedFutureYield: 0.0197,
      method: 'baseline',
      isAvailable: true,
      inputs: {
        latestPrice: 1688,
        latestTotalShares: 1256197800,
        latestAnnualNetProfit: 86228000000,
        lastAnnualPayoutRatio: 0.56,
        lastYearTotalDividendAmount: 38782000000
      },
      steps: ['基于最近年度利润与分红比例，维持稳定派息假设。']
    },
    futureYieldEstimates: [
      {
        estimatedDividendPerShare: 33.2,
        estimatedFutureYield: 0.0197,
        method: 'baseline',
        isAvailable: true,
        inputs: {
          latestPrice: 1688,
          latestTotalShares: 1256197800,
          latestAnnualNetProfit: 86228000000,
          lastAnnualPayoutRatio: 0.56,
          lastYearTotalDividendAmount: 38782000000
        },
        steps: ['基于最近年度利润与分红比例，维持稳定派息假设。']
      },
      {
        estimatedDividendPerShare: 30.1,
        estimatedFutureYield: 0.0178,
        method: 'conservative',
        isAvailable: true,
        inputs: {
          latestPrice: 1688,
          latestTotalShares: 1256197800,
          latestAnnualNetProfit: 86228000000,
          lastAnnualPayoutRatio: 0.51,
          lastYearTotalDividendAmount: 38782000000
        },
        steps: ['下调分红比例后得到更保守估算。']
      }
    ],
    valuation: buildMockValuation(24.6, 8.3, {
      pe10y: { percentile: 58.4, p30: 21.2, p50: 24.1, p70: 28.6 },
      pe20y: { percentile: 44.8, p30: 18.4, p50: 22.5, p70: 27.3 },
      pb10y: { percentile: 67.2, p30: 5.6, p50: 6.8, p70: 8.1 },
      pb20y: { percentile: 53.9, p30: 4.8, p50: 6.1, p70: 7.7 }
    })
  },
  '000651': {
    assetKey: buildStockAssetKey('000651'),
    assetType: 'STOCK',
    code: '000651',
    symbol: '000651',
    name: '格力电器',
    market: 'A_SHARE',
    industry: '家电',
    latestPrice: 42.6,
    marketCap: 238000000000,
    peRatio: 8.9,
    pbRatio: 2.1,
    totalShares: 5560140000,
    dataSource: 'mock',
    yieldBasis: '浏览器预览模式下使用内置 mock 数据，口径仍按事件级股息率累加展示。',
    yearlyYields: [
      { year: 2020, yield: 0.043, events: 1 },
      { year: 2021, yield: 0.056, events: 1 },
      { year: 2022, yield: 0.064, events: 1 },
      { year: 2023, yield: 0.071, events: 1 },
      { year: 2024, yield: 0.073, events: 1 }
    ],
    dividendEvents: [
      {
        year: 2020,
        fiscalYear: 2019,
        announceDate: '2020-06-01',
        recordDate: '2020-06-18',
        exDate: '2020-06-19',
        payDate: '2020-06-19',
        dividendPerShare: 1.2,
        payoutRatio: 0.48,
        referenceClosePrice: 27.8,
        source: 'mock'
      },
      {
        year: 2021,
        fiscalYear: 2020,
        announceDate: '2021-06-01',
        recordDate: '2021-06-17',
        exDate: '2021-06-18',
        payDate: '2021-06-18',
        dividendPerShare: 2.0,
        payoutRatio: 0.54,
        referenceClosePrice: 35.7,
        source: 'mock'
      },
      {
        year: 2022,
        fiscalYear: 2021,
        announceDate: '2022-06-02',
        recordDate: '2022-06-23',
        exDate: '2022-06-24',
        payDate: '2022-06-24',
        dividendPerShare: 2.0,
        payoutRatio: 0.56,
        referenceClosePrice: 31.1,
        source: 'mock'
      },
      {
        year: 2023,
        fiscalYear: 2022,
        announceDate: '2023-06-01',
        recordDate: '2023-06-28',
        exDate: '2023-06-29',
        payDate: '2023-06-29',
        dividendPerShare: 2.2,
        payoutRatio: 0.58,
        referenceClosePrice: 30.9,
        source: 'mock'
      },
      {
        year: 2024,
        fiscalYear: 2023,
        announceDate: '2024-06-01',
        recordDate: '2024-06-20',
        exDate: '2024-06-21',
        payDate: '2024-06-21',
        dividendPerShare: 3.0,
        payoutRatio: 0.61,
        referenceClosePrice: 41.1,
        source: 'mock'
      }
    ],
    futureYieldEstimate: {
      estimatedDividendPerShare: 3.1,
      estimatedFutureYield: 0.0728,
      method: 'baseline',
      isAvailable: true,
      inputs: {
        latestPrice: 42.6,
        latestTotalShares: 5560140000,
        latestAnnualNetProfit: 29017000000,
        lastAnnualPayoutRatio: 0.61,
        lastYearTotalDividendAmount: 16680000000
      },
      steps: ['基于最近年度派息水平做平稳延续估算。']
    },
    futureYieldEstimates: [
      {
        estimatedDividendPerShare: 3.1,
        estimatedFutureYield: 0.0728,
        method: 'baseline',
        isAvailable: true,
        inputs: {
          latestPrice: 42.6,
          latestTotalShares: 5560140000,
          latestAnnualNetProfit: 29017000000,
          lastAnnualPayoutRatio: 0.61,
          lastYearTotalDividendAmount: 16680000000
        },
        steps: ['基于最近年度派息水平做平稳延续估算。']
      }
    ],
    valuation: buildMockValuation(8.9, 2.1, {
      pe10y: { percentile: 18.6, p30: 10.1, p50: 12.3, p70: 15.8 },
      pe20y: { percentile: 24.7, p30: 9.6, p50: 11.8, p70: 15.4 },
      pb10y: { percentile: 21.4, p30: 2.3, p50: 2.8, p70: 3.4 },
      pb20y: { percentile: 28.8, p30: 2.1, p50: 2.6, p70: 3.3 }
    })
  },
  '601318': {
    assetKey: buildStockAssetKey('601318'),
    assetType: 'STOCK',
    code: '601318',
    symbol: '601318',
    name: '中国平安',
    market: 'A_SHARE',
    industry: '保险',
    latestPrice: 46.2,
    marketCap: 845000000000,
    peRatio: 7.3,
    pbRatio: 1.1,
    totalShares: 18280300000,
    dataSource: 'mock',
    yieldBasis: '浏览器预览模式下使用内置 mock 数据，口径仍按事件级股息率累加展示。',
    yearlyYields: [
      { year: 2020, yield: 0.051, events: 2 },
      { year: 2021, yield: 0.058, events: 2 },
      { year: 2022, yield: 0.061, events: 2 },
      { year: 2023, yield: 0.064, events: 2 },
      { year: 2024, yield: 0.067, events: 2 }
    ],
    dividendEvents: [
      {
        year: 2023,
        fiscalYear: 2022,
        announceDate: '2023-06-01',
        recordDate: '2023-06-15',
        exDate: '2023-06-16',
        payDate: '2023-06-16',
        dividendPerShare: 1.5,
        payoutRatio: 0.36,
        referenceClosePrice: 46.1,
        source: 'mock'
      },
      {
        year: 2023,
        fiscalYear: 2022,
        announceDate: '2023-10-26',
        recordDate: '2023-11-16',
        exDate: '2023-11-17',
        payDate: '2023-11-17',
        dividendPerShare: 0.93,
        payoutRatio: 0.22,
        referenceClosePrice: 37.4,
        source: 'mock'
      },
      {
        year: 2024,
        fiscalYear: 2023,
        announceDate: '2024-06-01',
        recordDate: '2024-06-13',
        exDate: '2024-06-14',
        payDate: '2024-06-14',
        dividendPerShare: 1.5,
        payoutRatio: 0.37,
        referenceClosePrice: 44.3,
        source: 'mock'
      },
      {
        year: 2024,
        fiscalYear: 2023,
        announceDate: '2024-10-24',
        recordDate: '2024-11-14',
        exDate: '2024-11-15',
        payDate: '2024-11-15',
        dividendPerShare: 1.0,
        payoutRatio: 0.24,
        referenceClosePrice: 40.2,
        source: 'mock'
      }
    ],
    futureYieldEstimate: {
      estimatedDividendPerShare: 2.7,
      estimatedFutureYield: 0.0584,
      method: 'baseline',
      isAvailable: true,
      inputs: {
        latestPrice: 46.2,
        latestTotalShares: 18280300000,
        latestAnnualNetProfit: 85600000000,
        lastAnnualPayoutRatio: 0.61,
        lastYearTotalDividendAmount: 45700000000
      },
      steps: ['延续最近年度分红强度，估算未来一年股息率。']
    },
    futureYieldEstimates: [
      {
        estimatedDividendPerShare: 2.7,
        estimatedFutureYield: 0.0584,
        method: 'baseline',
        isAvailable: true,
        inputs: {
          latestPrice: 46.2,
          latestTotalShares: 18280300000,
          latestAnnualNetProfit: 85600000000,
          lastAnnualPayoutRatio: 0.61,
          lastYearTotalDividendAmount: 45700000000
        },
        steps: ['延续最近年度分红强度，估算未来一年股息率。']
      }
    ],
    valuation: buildMockValuation(7.3, 1.1, {
      pe10y: { percentile: 16.2, p30: 8.1, p50: 9.3, p70: 11.4 },
      pe20y: { percentile: 22.1, p30: 7.8, p50: 9.1, p70: 11.1 },
      pb10y: { percentile: 12.8, p30: 1.2, p50: 1.4, p70: 1.7 },
      pb20y: { percentile: 19.5, p30: 1.1, p50: 1.3, p70: 1.6 }
    })
  }
}

const mockFundSearchItems: AssetSearchItemDto[] = [
  {
    assetKey: 'ETF:A_SHARE:510300',
    assetType: 'ETF',
    market: 'A_SHARE',
    code: '510300',
    name: '沪深300ETF'
  },
  {
    assetKey: 'ETF:A_SHARE:512880',
    assetType: 'ETF',
    market: 'A_SHARE',
    code: '512880',
    name: '证券ETF'
  },
  {
    assetKey: 'FUND:A_SHARE:160222',
    assetType: 'FUND',
    market: 'A_SHARE',
    code: '160222',
    name: '国泰国证食品饮料行业指数'
  }
]

const mockFundDetails: Record<string, FlatDetailDto> = {
  'ETF:A_SHARE:510300': {
    assetKey: 'ETF:A_SHARE:510300',
    assetType: 'ETF',
    market: 'A_SHARE',
    code: '510300',
    name: '沪深300ETF',
    category: '指数型-股票',
    manager: '华泰柏瑞基金',
    trackingIndex: '沪深300指数',
    benchmark: '沪深300指数',
    latestNav: 4.7842,
    fundScale: 199914000000,
    latestPrice: 4.782,
    dataSource: 'mock',
    yieldBasis: '浏览器预览模式下使用 ETF mock 现金分配数据，按年度累加展示历史分配收益率。',
    yearlyYields: [
      { year: 2022, yield: 0.0156, events: 1 },
      { year: 2023, yield: 0.0137, events: 1 },
      { year: 2024, yield: 0.0144, events: 1 },
      { year: 2025, yield: 0.0184, events: 1 },
      { year: 2026, yield: 0.0257, events: 1 }
    ],
    dividendEvents: [
      { year: 2022, recordDate: '2022-01-18', exDate: '2022-01-19', payDate: '2022-01-24', dividendPerShare: 0.075, referenceClosePrice: 4.81, source: 'mock-etf' },
      { year: 2023, recordDate: '2023-01-13', exDate: '2023-01-16', payDate: '2023-01-19', dividendPerShare: 0.064, referenceClosePrice: 4.68, source: 'mock-etf' },
      { year: 2024, recordDate: '2024-01-17', exDate: '2024-01-18', payDate: '2024-01-23', dividendPerShare: 0.069, referenceClosePrice: 4.80, source: 'mock-etf' },
      { year: 2025, recordDate: '2025-06-17', exDate: '2025-06-18', payDate: '2025-06-27', dividendPerShare: 0.088, referenceClosePrice: 4.77, source: 'mock-etf' },
      { year: 2026, recordDate: '2026-01-16', exDate: '2026-01-19', payDate: '2026-01-27', dividendPerShare: 0.123, referenceClosePrice: 4.79, source: 'mock-etf' }
    ],
    futureYieldEstimate: {
      estimatedDividendPerShare: 0,
      estimatedFutureYield: 0,
      method: 'baseline',
      isAvailable: false,
      reason: 'ETF 暂不提供未来股息率估算',
      inputs: {},
      steps: ['浏览器预览模式下，ETF 仅展示历史现金分配收益率。']
    },
    futureYieldEstimates: [
      {
        estimatedDividendPerShare: 0,
        estimatedFutureYield: 0,
        method: 'baseline',
        isAvailable: false,
        reason: 'ETF 暂不提供未来股息率估算',
        inputs: {},
        steps: ['浏览器预览模式下，ETF 仅展示历史现金分配收益率。']
      }
    ]
  },
  'ETF:A_SHARE:512880': {
    assetKey: 'ETF:A_SHARE:512880',
    assetType: 'ETF',
    market: 'A_SHARE',
    code: '512880',
    name: '证券ETF',
    category: '指数型-股票',
    manager: '国泰基金',
    trackingIndex: '中证全指证券公司指数',
    benchmark: '中证全指证券公司指数',
    latestNav: 1.152,
    fundScale: 18320000000,
    latestPrice: 1.149,
    dataSource: 'mock',
    yieldBasis: '浏览器预览模式下使用 ETF mock 现金分配数据，按年度累加展示历史分配收益率。',
    yearlyYields: [
      { year: 2023, yield: 0.0103, events: 1 },
      { year: 2024, yield: 0.0128, events: 1 }
    ],
    dividendEvents: [
      { year: 2023, recordDate: '2023-12-08', exDate: '2023-12-11', payDate: '2023-12-15', dividendPerShare: 0.012, referenceClosePrice: 1.163, source: 'mock-etf' },
      { year: 2024, recordDate: '2024-12-06', exDate: '2024-12-09', payDate: '2024-12-13', dividendPerShare: 0.015, referenceClosePrice: 1.172, source: 'mock-etf' }
    ],
    futureYieldEstimate: {
      estimatedDividendPerShare: 0,
      estimatedFutureYield: 0,
      method: 'baseline',
      isAvailable: false,
      reason: 'ETF 暂不提供未来股息率估算',
      inputs: {},
      steps: ['浏览器预览模式下，ETF 仅展示历史现金分配收益率。']
    },
    futureYieldEstimates: [
      {
        estimatedDividendPerShare: 0,
        estimatedFutureYield: 0,
        method: 'baseline',
        isAvailable: false,
        reason: 'ETF 暂不提供未来股息率估算',
        inputs: {},
        steps: ['浏览器预览模式下，ETF 仅展示历史现金分配收益率。']
      }
    ]
  },
  'FUND:A_SHARE:160222': {
    assetKey: 'FUND:A_SHARE:160222',
    assetType: 'FUND',
    market: 'A_SHARE',
    code: '160222',
    name: '国泰国证食品饮料行业指数',
    category: 'LOF-指数',
    manager: '国泰基金',
    trackingIndex: '国证食品饮料行业指数',
    benchmark: '国证食品饮料行业指数收益率',
    latestNav: 1.836,
    fundScale: 5200000000,
    latestPrice: 1.832,
    dataSource: 'mock',
    yieldBasis: '浏览器预览模式下使用基金 mock 现金分配数据，按年度累加展示历史分配收益率。',
    yearlyYields: [{ year: 2024, yield: 0.0068, events: 1 }],
    dividendEvents: [
      { year: 2024, recordDate: '2024-07-12', exDate: '2024-07-15', payDate: '2024-07-18', dividendPerShare: 0.012, referenceClosePrice: 1.764, source: 'mock-fund' }
    ],
    futureYieldEstimate: {
      estimatedDividendPerShare: 0,
      estimatedFutureYield: 0,
      method: 'baseline',
      isAvailable: false,
      reason: '基金暂不提供未来股息率估算',
      inputs: {},
      steps: ['浏览器预览模式下，基金仅展示历史现金分配收益率。']
    },
    futureYieldEstimates: [
      {
        estimatedDividendPerShare: 0,
        estimatedFutureYield: 0,
        method: 'baseline',
        isAvailable: false,
        reason: '基金暂不提供未来股息率估算',
        inputs: {},
        steps: ['浏览器预览模式下，基金仅展示历史现金分配收益率。']
      }
    ]
  }
}

const mockBacktests: Record<string, BacktestResultDto> = {
  '600519': {
    symbol: '600519',
    buyDate: '2024-01-02',
    finalDate: '2025-04-25',
    buyPrice: 1680,
    initialCost: 168000,
    finalShares: 102.116,
    totalDividendsReceived: 3150,
    reinvestCount: 1,
    finalMarketValue: 172325,
    totalReturn: 0.0257,
    annualizedReturn: 0.0191,
    assumptions: [
      '浏览器预览模式使用内置 mock 回测数据，便于页面联调。',
      '买入价格按起始日收盘价。',
      '现金分红到账后按下一交易日价格全额复投。',
      '未计入手续费、税费与最小交易单位限制。'
    ],
    transactions: [
      {
        type: 'BUY',
        date: '2024-01-02',
        price: 1680,
        cashAmount: -168000,
        sharesDelta: 100,
        sharesAfter: 100,
        note: '起始日一次性建仓'
      },
      {
        type: 'DIVIDEND',
        date: '2024-06-14',
        cashAmount: 3087.6,
        sharesDelta: 0,
        sharesAfter: 100,
        note: '收到年度现金分红'
      },
      {
        type: 'REINVEST',
        date: '2024-06-17',
        price: 1456,
        cashAmount: -3087.6,
        sharesDelta: 2.116,
        sharesAfter: 102.116,
        note: '按到账后首个交易日价格复投'
      }
    ]
  }
}

function getAvailableStockDetails(): AssetDetailDto[] {
  return Object.values(mockStockDetails).map((d) => augmentStockMock(d))
}

function normalizeSymbol(symbol: string) {
  return symbol.trim()
}

function isBrowserStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readWatchlistAssetKeysFromStorage() {
  if (!isBrowserStorageAvailable()) {
    return []
  }

  const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as string[]
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => (item.includes(':') ? item : buildStockAssetKey(item)))
  } catch {
    return []
  }
}

function writeWatchlistAssetKeysToStorage(assetKeys: string[]) {
  if (!isBrowserStorageAvailable()) {
    return
  }

  const normalized = [...new Set(assetKeys.map((item) => item.trim()).filter((item) => item.length > 0))]
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(normalized))
}

function toWatchlistItem(detail: AssetDetailDto): WatchlistEntryDto {
  return {
    assetKey: detail.assetKey,
    assetType: detail.assetType,
    code: detail.code,
    symbol: detail.symbol,
    name: detail.name,
    market: detail.market,
    latestPrice: detail.latestPrice,
    peRatio: detail.peRatio,
    estimatedFutureYield: detail.futureYieldEstimate.isAvailable ? detail.futureYieldEstimate.estimatedFutureYield : undefined,
    averageYield:
      detail.yearlyYields.length > 0
        ? detail.yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(detail.yearlyYields.length, 1)
        : undefined,
    yieldLabel: detail.futureYieldEstimate.isAvailable ? '预期股息率' : '历史分配收益率'
  }
}

function toComparisonRow(detail: AssetDetailDto): AssetComparisonRowDto {
  const averageYield =
    detail.yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(detail.yearlyYields.length, 1)

  return {
    assetKey: detail.assetKey,
    assetType: detail.assetType,
    market: detail.market,
    code: detail.code,
    symbol: detail.symbol,
    name: detail.name,
    latestPrice: detail.latestPrice,
    marketCap: detail.marketCap,
    peRatio: detail.peRatio,
    pbRatio: detail.pbRatio,
    averageYield: detail.yearlyYields.length > 0 ? averageYield : undefined,
    estimatedFutureYield: detail.futureYieldEstimate.isAvailable ? detail.futureYieldEstimate.estimatedFutureYield : undefined,
    valuation: detail.valuation
  }
}

function ensureMockStockDetail(symbol: string): AssetDetailDto {
  const s = normalizeSymbol(symbol)
  const detail = mockStockDetails[s]
  if (!detail) {
    throw new Error(`浏览器预览模式暂不支持该股票代码：${symbol}。当前可用示例：600519、000651、601318。`)
  }
  return augmentStockMock(detail)
}

function ensureMockAssetDetail(query: AssetQueryDto): AssetDetailDto {
  const identifier = resolveAssetQuery(query)
  const assetKey = buildAssetKey(identifier.assetType, identifier.market, identifier.code)
  if (identifier.assetType === 'STOCK') {
    return ensureMockStockDetail(identifier.code)
  }

  const detail = mockFundDetails[assetKey]
  if (!detail) {
    throw new Error(`浏览器预览模式暂不支持该基金资产：${assetKey}。`)
  }
  return augmentFundMock(detail)
}

function assetKeyToDetail(assetKey: string) {
  try {
    return ensureMockAssetDetail({ assetKey })
  } catch {
    return null
  }
}

export const browserRuntimeApi: DividendMonitorApi = {
  auth: {
    async login() { return null },
    async register() { return { session: null, needsConfirmation: false } },
    async logout() {},
    async getSession() { return null },
    async updatePassword() {},
    onAuthStateChange() { return () => {} }
  },
  sync: {
    onStatusChange() { return () => {} },
    async syncData() { return { direction: 'bidirectional', watchlistPushed: 0, watchlistPulled: 0, portfolioPushed: 0, portfolioPulled: 0, errors: [] } }
  },
  asset: {
    async search(request: AssetSearchRequestDto): Promise<AssetSearchItemDto[]> {
      const normalized = request.keyword.trim().toLowerCase()
      if (!normalized) {
        return []
      }

      const supportedTypes = request.assetTypes ?? ['STOCK']
      const stockResults = supportedTypes.includes('STOCK')
        ? getAvailableStockDetails()
            .filter((item) => (item.symbol ?? '').includes(normalized) || item.name.toLowerCase().includes(normalized))
            .map((item) => ({
              assetKey: item.assetKey,
              assetType: 'STOCK' as const,
              market: item.market,
              code: item.code,
              symbol: item.symbol,
              name: item.name
            }))
        : []

      const fundResults = mockFundSearchItems.filter((item) => {
        if (!supportedTypes.includes(item.assetType)) {
          return false
        }

        return item.code.includes(normalized) || item.name.toLowerCase().includes(normalized)
      })

      return [...stockResults, ...fundResults]
    },

    async getDetail(request: AssetQueryDto): Promise<AssetDetailDto> {
      return ensureMockAssetDetail(request)
    },

    async compare(request: AssetCompareRequestDto) {
      return request.items.map((item) => toComparisonRow(ensureMockAssetDetail(item)))
    }
  },

  stock: {
    async search(keyword: string): Promise<StockSearchItemDto[]> {
      return browserRuntimeApi.asset.search({
        keyword,
        assetTypes: ['STOCK']
      }) as Promise<StockSearchItemDto[]>
    },

    async getDetail(symbol: string): Promise<StockDetailDto> {
      return browserRuntimeApi.asset.getDetail(createStockAssetQuery(symbol)) as Promise<StockDetailDto>
    },

    async compare(symbols: string[]): Promise<ComparisonRowDto[]> {
      return browserRuntimeApi.asset.compare({
        items: symbols.map((symbol) => createStockAssetQuery(symbol))
      }) as Promise<ComparisonRowDto[]>
    }
  },

  watchlist: {
    async list(): Promise<WatchlistEntryDto[]> {
      return readWatchlistAssetKeysFromStorage()
        .map((assetKey) => assetKeyToDetail(assetKey))
        .filter((item): item is AssetDetailDto => item != null)
        .map(toWatchlistItem)
    },

    async add(symbol: string): Promise<void> {
      await browserRuntimeApi.watchlist.addAsset(createStockAssetQuery(symbol))
    },

    async remove(symbol: string): Promise<void> {
      await browserRuntimeApi.watchlist.removeAsset(buildStockAssetKey(symbol))
    },

    async addAsset(request): Promise<void> {
      const detail = ensureMockAssetDetail(request)
      const current = readWatchlistAssetKeysFromStorage().filter((item) => item !== detail.assetKey)
      writeWatchlistAssetKeysToStorage([detail.assetKey, ...current])
    },

    async removeAsset(assetKey: string): Promise<void> {
      const normalized = assetKey.trim()
      writeWatchlistAssetKeysToStorage(readWatchlistAssetKeysFromStorage().filter((item) => item !== normalized))
    }
  },

  calculation: {
    async getHistoricalYield(symbol: string): Promise<HistoricalYieldResponseDto> {
      const detail = ensureMockStockDetail(symbol)
      return {
        assetKey: detail.assetKey,
        assetType: 'STOCK',
        market: detail.market,
        code: detail.code,
        symbol: detail.code,
        basis: detail.yieldBasis,
        yearlyYields: detail.yearlyYields,
        dividendEvents: detail.dividendEvents
      }
    },

    async estimateFutureYield(symbol: string) {
      const detail = ensureMockStockDetail(symbol)
      return {
        assetKey: detail.assetKey,
        assetType: 'STOCK',
        market: detail.market,
        code: detail.code,
        symbol: detail.code,
        estimates: detail.futureYieldEstimates
      }
    },

    async runDividendReinvestmentBacktest(symbol: string, buyDate: string): Promise<BacktestResultDto> {
      const normalized = normalizeSymbol(symbol)
      const backtest = mockBacktests[normalized]
      if (!backtest) {
        throw new Error(`浏览器预览模式暂未提供 ${symbol} 的回测示例数据。`)
      }

      return {
        assetKey: buildStockAssetKey(normalized),
        assetType: 'STOCK',
        market: 'A_SHARE',
        code: normalized,
        ...backtest,
        buyDate
      }
    },

    async getHistoricalYieldForAsset(request: AssetQueryDto) {
      const detail = ensureMockAssetDetail(request)
      return {
        assetKey: detail.assetKey,
        assetType: detail.assetType,
        market: detail.market,
        code: detail.code,
        symbol: detail.symbol ?? detail.code,
        basis: detail.yieldBasis,
        yearlyYields: detail.yearlyYields,
        dividendEvents: detail.dividendEvents
      }
    },

    async estimateFutureYieldForAsset(request: AssetQueryDto): Promise<FutureYieldResponseDto> {
      const detail = ensureMockAssetDetail(request)
      return {
        assetKey: detail.assetKey,
        assetType: detail.assetType,
        market: detail.market,
        code: detail.code,
        symbol: detail.symbol ?? detail.code,
        estimates: detail.futureYieldEstimates
      }
    },

    async runDividendReinvestmentBacktestForAsset(request: AssetBacktestRequestDto) {
      const detail = ensureMockAssetDetail(request.asset)
      if (detail.assetType === 'STOCK' && detail.symbol) {
        return browserRuntimeApi.calculation.runDividendReinvestmentBacktest(detail.symbol, request.buyDate)
      }

      return {
        assetKey: detail.assetKey,
        assetType: detail.assetType,
        market: detail.market,
        code: detail.code,
        symbol: detail.code,
        buyDate: request.buyDate,
        finalDate: '2026-04-24',
        buyPrice: detail.latestPrice,
        initialCost: detail.latestPrice * 10000,
        finalShares: 10000,
        totalDividendsReceived: detail.dividendEvents.reduce((sum, item) => sum + item.dividendPerShare * 10000, 0),
        reinvestCount: detail.dividendEvents.length,
        finalMarketValue: detail.latestPrice * 10000,
        totalReturn: 0.041,
        annualizedReturn: 0.017,
        assumptions: ['浏览器预览模式下，ETF/FUND 回测使用简化 mock 结果。'],
        transactions: [
          {
            type: 'BUY',
            date: request.buyDate,
            price: detail.latestPrice,
            cashAmount: -(detail.latestPrice * 10000),
            sharesDelta: 10000,
            sharesAfter: 10000,
            note: '使用 mock 数据生成的初始建仓'
          }
        ]
      }
    }
  },
  portfolio: {
    async list() {
      return readPortfolioPositions().map((item) => ({
        id: item.id,
        assetKey: buildStockAssetKey(item.symbol ?? ''),
        assetType: 'STOCK' as const,
        market: 'A_SHARE' as const,
        code: item.symbol ?? '',
        symbol: item.symbol,
        name: item.name,
        direction: item.direction === 'SELL' ? 'SELL' : 'BUY',
        shares: item.shares,
        avgCost: item.avgCost,
        createdAt: item.updatedAt,
        updatedAt: item.updatedAt
      }))
    },

    async upsert(request) {
      upsertPortfolioPosition({
        id: request.id ?? '',
        symbol: request.symbol ?? request.code,
        name: request.name,
        direction: request.direction,
        shares: request.shares,
        avgCost: request.avgCost
      })
    },

    async remove(id: string) {
      removePortfolioPosition(id)
    },

    async removeByAsset(request) {
      const identifier = resolveAssetQuery(request)
      if (identifier.assetType !== 'STOCK') {
        return
      }
      removePortfolioPositionsBySymbol(identifier.code)
    },

    async replaceByAsset(request) {
      const identifier = resolveAssetQuery(request.asset)
      if (identifier.assetType !== 'STOCK') {
        throw new Error('浏览器预览模式下持仓编辑仍仅支持股票。')
      }
      replacePortfolioPositionsBySymbol(identifier.code, {
        name: request.name,
        shares: request.shares,
        avgCost: request.avgCost
      })
    },

    async getRiskMetrics() {
      return {}
    }
  },
  security: {
    async getLocalNonce() { return '' }
  }
}
