import type {
  BacktestResultDto,
  ComparisonRowDto,
  DividendMonitorApi,
  HistoricalYieldResponseDto,
  StockDetailDto,
  StockSearchItemDto,
  ValuationSnapshotDto,
  WatchlistItemDto
} from '@shared/contracts/api'

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

const mockStockDetails: Record<string, StockDetailDto> = {
  '600519': {
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

function getAvailableStockDetails() {
  return Object.values(mockStockDetails)
}

function normalizeSymbol(symbol: string) {
  return symbol.trim()
}

function isBrowserStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readWatchlistSymbolsFromStorage() {
  if (!isBrowserStorageAvailable()) {
    return []
  }

  const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed.map(normalizeSymbol).filter((item) => item.length > 0) : []
  } catch {
    return []
  }
}

function writeWatchlistSymbolsToStorage(symbols: string[]) {
  if (!isBrowserStorageAvailable()) {
    return
  }

  const normalized = [...new Set(symbols.map(normalizeSymbol).filter((item) => item.length > 0))]
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(normalized))
}

function toWatchlistItem(detail: StockDetailDto): WatchlistItemDto {
  return {
    symbol: detail.symbol,
    name: detail.name,
    market: detail.market,
    latestPrice: detail.latestPrice,
    peRatio: detail.peRatio,
    estimatedFutureYield: detail.futureYieldEstimate.estimatedFutureYield
  }
}

function toComparisonRow(detail: StockDetailDto): ComparisonRowDto {
  const averageYield =
    detail.yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(detail.yearlyYields.length, 1)

  return {
    symbol: detail.symbol,
    name: detail.name,
    latestPrice: detail.latestPrice,
    marketCap: detail.marketCap,
    peRatio: detail.peRatio,
    pbRatio: detail.pbRatio,
    averageYield,
    estimatedFutureYield: detail.futureYieldEstimate.estimatedFutureYield,
    valuation: detail.valuation
  }
}

function ensureMockStockDetail(symbol: string) {
  const detail = mockStockDetails[normalizeSymbol(symbol)]
  if (!detail) {
    throw new Error(`浏览器预览模式暂不支持该股票代码：${symbol}。当前可用示例：600519、000651、601318。`)
  }
  return detail
}

export const browserRuntimeApi: DividendMonitorApi = {
  stock: {
    async search(keyword: string): Promise<StockSearchItemDto[]> {
      const normalized = keyword.trim().toLowerCase()
      if (!normalized) {
        return []
      }

      return getAvailableStockDetails()
        .filter((item) => item.symbol.includes(normalized) || item.name.toLowerCase().includes(normalized))
        .map((item) => ({
          symbol: item.symbol,
          name: item.name,
          market: item.market
        }))
    },

    async getDetail(symbol: string): Promise<StockDetailDto> {
      return ensureMockStockDetail(symbol)
    },

    async compare(symbols: string[]): Promise<ComparisonRowDto[]> {
      return symbols.map((symbol) => toComparisonRow(ensureMockStockDetail(symbol)))
    }
  },

  watchlist: {
    async list(): Promise<WatchlistItemDto[]> {
      return readWatchlistSymbolsFromStorage()
        .map((symbol) => mockStockDetails[symbol])
        .filter((item): item is StockDetailDto => item != null)
        .map(toWatchlistItem)
    },

    async add(symbol: string): Promise<void> {
      const detail = ensureMockStockDetail(symbol)
      const current = readWatchlistSymbolsFromStorage().filter((item) => item !== detail.symbol)
      writeWatchlistSymbolsToStorage([detail.symbol, ...current])
    },

    async remove(symbol: string): Promise<void> {
      const normalized = normalizeSymbol(symbol)
      writeWatchlistSymbolsToStorage(readWatchlistSymbolsFromStorage().filter((item) => item !== normalized))
    }
  },

  calculation: {
    async getHistoricalYield(symbol: string): Promise<HistoricalYieldResponseDto> {
      const detail = ensureMockStockDetail(symbol)
      return {
        symbol: detail.symbol,
        basis: detail.yieldBasis,
        yearlyYields: detail.yearlyYields,
        dividendEvents: detail.dividendEvents
      }
    },

    async estimateFutureYield(symbol: string) {
      const detail = ensureMockStockDetail(symbol)
      return {
        symbol: detail.symbol,
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
        ...backtest,
        buyDate
      }
    }
  }
}
