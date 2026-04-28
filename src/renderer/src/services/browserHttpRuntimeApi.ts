import type {
  AssetBacktestRequestDto,
  AssetCompareRequestDto,
  AssetQueryDto,
  AssetSearchRequestDto,
  BacktestResultDto,
  ComparisonRowDto,
  DividendMonitorApi,
  HistoricalYieldResponseDto,
  FutureYieldResponseDto,
  PortfolioPositionReplaceByAssetDto,
  PortfolioPositionUpsertDto,
  PortfolioRiskMetricsDto,
  StockDetailDto,
  StockSearchItemDto,
  WatchlistAddRequestDto,
  WatchlistEntryDto
} from '@shared/contracts/api'
import { createStockAssetQuery } from '@shared/contracts/api'
import { requestJson } from '@renderer/services/httpClient'

async function postJson<T>(path: string, body: unknown) {
  return requestJson<T>(path, {
    method: 'POST',
    body
  })
}

export const browserHttpRuntimeApi: DividendMonitorApi = {
  asset: {
    search(request: AssetSearchRequestDto) {
      return postJson('/api/asset/search', request)
    },
    getDetail(request: AssetQueryDto) {
      return postJson('/api/asset/detail', request)
    },
    compare(request: AssetCompareRequestDto) {
      return postJson('/api/asset/compare', request)
    }
  },
  stock: {
    async search(keyword: string): Promise<StockSearchItemDto[]> {
      const result = await postJson<StockSearchItemDto[]>('/api/asset/search', {
        keyword,
        assetTypes: ['STOCK']
      })
      return result
    },
    async getDetail(symbol: string): Promise<StockDetailDto> {
      const result = await postJson<StockDetailDto>('/api/asset/detail', createStockAssetQuery(symbol))
      return result
    },
    async compare(symbols: string[]): Promise<ComparisonRowDto[]> {
      const result = await postJson<ComparisonRowDto[]>('/api/asset/compare', {
        items: symbols.map((symbol) => createStockAssetQuery(symbol))
      })
      return result
    }
  },
  watchlist: {
    list(): Promise<WatchlistEntryDto[]> {
      return requestJson('/api/watchlist')
    },
    add(symbol: string) {
      return postJson<void>('/api/watchlist/add-asset', createStockAssetQuery(symbol))
    },
    remove(symbol: string) {
      return postJson<void>('/api/watchlist/remove-asset', { assetKey: createStockAssetQuery(symbol).assetKey })
    },
    addAsset(request: WatchlistAddRequestDto) {
      return postJson<void>('/api/watchlist/add-asset', request)
    },
    removeAsset(assetKey: string) {
      return postJson<void>('/api/watchlist/remove-asset', { assetKey })
    }
  },
  calculation: {
    getHistoricalYield(symbol: string): Promise<HistoricalYieldResponseDto> {
      return postJson('/api/calculation/historical-yield', createStockAssetQuery(symbol))
    },
    estimateFutureYield(symbol: string): Promise<FutureYieldResponseDto> {
      return postJson('/api/calculation/estimate-future-yield', createStockAssetQuery(symbol))
    },
    runDividendReinvestmentBacktest(symbol: string, buyDate: string): Promise<BacktestResultDto> {
      return postJson('/api/calculation/backtest', {
        asset: createStockAssetQuery(symbol),
        buyDate
      } satisfies AssetBacktestRequestDto)
    },
    getHistoricalYieldForAsset(request: AssetQueryDto): Promise<HistoricalYieldResponseDto> {
      return postJson('/api/calculation/historical-yield', request)
    },
    estimateFutureYieldForAsset(request: AssetQueryDto): Promise<FutureYieldResponseDto> {
      return postJson('/api/calculation/estimate-future-yield', request)
    },
    runDividendReinvestmentBacktestForAsset(request: AssetBacktestRequestDto): Promise<BacktestResultDto> {
      return postJson('/api/calculation/backtest', request)
    }
  },
  portfolio: {
    list() {
      return requestJson('/api/portfolio')
    },
    upsert(request: PortfolioPositionUpsertDto) {
      return postJson<void>('/api/portfolio/upsert', request)
    },
    remove(id: string) {
      return postJson<void>('/api/portfolio/remove', { id })
    },
    removeByAsset(request: AssetQueryDto) {
      return postJson<void>('/api/portfolio/remove-by-asset', request)
    },
    replaceByAsset(request: PortfolioPositionReplaceByAssetDto) {
      return postJson<void>('/api/portfolio/replace-by-asset', request)
    },
    getRiskMetrics(request: { items: Array<{ assetKey: string; marketValue: number }> }) {
      return postJson<PortfolioRiskMetricsDto>('/api/portfolio/risk-metrics', request)
    }
  }
}
