import type {
  AssetBacktestRequestDto,
  AssetCompareRequestDto,
  AssetQueryDto,
  AssetSearchRequestDto,
  AuthSessionDto,
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
  SyncStatusDto,
  WatchlistAddRequestDto,
  WatchlistEntryDto
} from '@shared/contracts/api'
import { createStockAssetQuery } from '@shared/contracts/api'
import { requestJson } from '@renderer/services/httpClient'

// Cached local nonce for authenticating HTTP auth requests.
// Expires after 10 minutes so a nonce rotation (e.g. server restart) is
// picked up without requiring a full page reload.
const NONCE_CACHE_MS = 10 * 60 * 1000
let cachedNonce: string | null = null
let nonceExpiresAt: number = 0

async function getLocalNonce(): Promise<string> {
  if (cachedNonce && Date.now() < nonceExpiresAt) return cachedNonce
  cachedNonce = await window.dividendMonitor.security.getLocalNonce()
  nonceExpiresAt = Date.now() + NONCE_CACHE_MS
  return cachedNonce
}

async function postJsonWithNonce<T>(path: string, body: unknown) {
  const nonce = await getLocalNonce()
  return requestJson<T>(path, {
    method: 'POST',
    body,
    headers: { 'X-Local-Nonce': nonce }
  })
}

async function postJson<T>(path: string, body: unknown) {
  return requestJson<T>(path, {
    method: 'POST',
    body
  })
}

export const browserHttpRuntimeApi: DividendMonitorApi = {
  auth: {
    login(email, password) {
      return postJsonWithNonce<{ session: AuthSessionDto }>('/api/auth/login', { email, password }).then((r) => r.session)
    },
    register(email, password) {
      return postJsonWithNonce<{ session: AuthSessionDto; needsConfirmation: boolean }>('/api/auth/register', { email, password })
    },
    logout() {
      return postJson<void>('/api/auth/logout', {})
    },
    getSession() {
      return requestJson<{ session: AuthSessionDto }>('/api/auth/session').then((r) => r.session)
    },
    onAuthStateChange(_callback: (session: AuthSessionDto) => void) {
      // No-op for browser HTTP runtime; auth state changes are not pushed
      return () => {}
    },
    updatePassword(_newPassword: string) {
      return postJsonWithNonce<void>('/api/auth/update-password', { newPassword: _newPassword })
    }
  },
  sync: {
    onStatusChange(_callback: (status: SyncStatusDto) => void) {
      // No-op for browser HTTP runtime; sync status is not pushed
      return () => {}
    },
    syncData(_direction: 'push' | 'pull' | 'bidirectional') {
      // Not available in browser HTTP runtime
      return Promise.resolve({ direction: 'bidirectional', watchlistPushed: 0, watchlistPulled: 0, portfolioPushed: 0, portfolioPulled: 0, errors: ['浏览器模式不支持同步'] })
    }
  },
  industry: {
    getAnalysis(industryName?: string, assetKeys?: string[]) {
      return postJson('/api/industry/analysis', { industryName, assetKeys })
    },
    getDistribution() {
      return requestJson('/api/industry/distribution')
    }
  },
  settings: {
    get() {
      return requestJson('/api/settings')
    },
    update(partial: Record<string, unknown>) {
      return requestJson('/api/settings', { method: 'PUT', body: partial })
    },
    reset() {
      return requestJson('/api/settings', { method: 'DELETE' })
    }
  },
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
  },
  security: {
    getLocalNonce() {
      return window.dividendMonitor.security.getLocalNonce()
    }
  }
}
