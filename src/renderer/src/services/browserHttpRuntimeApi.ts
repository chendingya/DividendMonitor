import type {
  AssetBacktestRequestDto,
  AssetCompareRequestDto,
  AssetQueryDto,
  AssetSearchRequestDto,
  AuthSessionDto,
  BacktestResultDto,
  ComparisonRowDto,
  DividendForecastDto,
  DividendHistoryRequest,
  DividendHistoryResult,
  DividendMonitorApi,
  HistoricalYieldResponseDto,
  FutureYieldResponseDto,
  PortfolioPositionReplaceByAssetDto,
  PortfolioPositionUpsertDto,
  PortfolioRiskMetricsDto,
  StockDetailDto,
  StockSearchItemDto,
  SyncResultDto,
  SyncStatusDto,
  UpcomingDividendDto,
  WatchlistAddRequestDto,
  WatchlistEntryDto,
  WatchlistGroupAssetActionDto,
  WatchlistGroupDto,
  WatchlistGroupUpsertDto
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
  if (typeof window.dividendMonitor?.security?.getLocalNonce === 'function') {
    cachedNonce = await window.dividendMonitor.security.getLocalNonce()
  } else {
    const res = await requestJson<{ nonce: string }>('/api/security/nonce')
    cachedNonce = res.nonce
  }
  nonceExpiresAt = Date.now() + NONCE_CACHE_MS
  return cachedNonce
}

async function authedRequest<T>(path: string, options: Parameters<typeof requestJson>[1] = {}): Promise<T> {
  const nonce = await getLocalNonce()
  return requestJson<T>(path, {
    ...options,
    headers: { ...options.headers, 'X-Local-Nonce': nonce }
  })
}

async function postJson<T>(path: string, body: unknown) {
  return authedRequest<T>(path, {
    method: 'POST',
    body
  })
}

export const browserHttpRuntimeApi: DividendMonitorApi = {
  auth: {
    login(email, password) {
      return postJson<{ session: AuthSessionDto }>('/api/auth/login', { email, password }).then((r) => r.session)
    },
    register(email, password) {
      return postJson<{ session: AuthSessionDto; needsConfirmation: boolean }>('/api/auth/register', { email, password })
    },
    logout() {
      return postJson<void>('/api/auth/logout', {})
    },
    getSession() {
      return authedRequest<{ session: AuthSessionDto }>('/api/auth/session').then((r) => r.session)
    },
    onAuthStateChange(_callback: (session: AuthSessionDto) => void) {
      // No-op for browser HTTP runtime; auth state changes are not pushed
      return () => {}
    },
    updatePassword(_newPassword: string) {
      return postJson<void>('/api/auth/update-password', { newPassword: _newPassword })
    }
  },
  industry: {
    getAnalysis(industryName?: string, assetKeys?: string[]) {
      return postJson('/api/industry/analysis', { industryName, assetKeys })
    },
    getDistribution() {
      return authedRequest('/api/industry/distribution')
    },
    getBenchmark(industryName: string) {
      return postJson('/api/industry/benchmark', { industryName })
    }
  },
  settings: {
    get() {
      return authedRequest('/api/settings')
    },
    update(partial: Record<string, unknown>) {
      return authedRequest('/api/settings', { method: 'PUT', body: partial })
    },
    reset() {
      return authedRequest('/api/settings', { method: 'DELETE' })
    }
  },
  backup: {
    createBackup() {
      throw new Error('浏览器预览模式不支持备份恢复')
    },
    restoreBackup() {
      throw new Error('浏览器预览模式不支持备份恢复')
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
      return authedRequest('/api/watchlist')
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
    },
    listGroups(): Promise<WatchlistGroupDto[]> {
      return authedRequest('/api/watchlist/groups')
    },
    createGroup(request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
      return postJson('/api/watchlist/groups', request)
    },
    updateGroup(id: string, request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
      return authedRequest(`/api/watchlist/groups/${encodeURIComponent(id)}`, { method: 'PUT', body: request })
    },
    deleteGroup(id: string): Promise<void> {
      return authedRequest(`/api/watchlist/groups/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    addToGroup(request: WatchlistGroupAssetActionDto): Promise<void> {
      return postJson('/api/watchlist/groups/add-asset', request)
    },
    removeFromGroup(request: WatchlistGroupAssetActionDto): Promise<void> {
      return postJson('/api/watchlist/groups/remove-asset', request)
    },
    listGroupAssets(groupId: string): Promise<WatchlistEntryDto[]> {
      return authedRequest(`/api/watchlist/groups/${encodeURIComponent(groupId)}/assets`)
    },
    getAssetGroupIds(assetKey: string): Promise<string[]> {
      return authedRequest(`/api/watchlist/asset-groups/${encodeURIComponent(assetKey)}`)
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
      return authedRequest('/api/portfolio')
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
      return requestJson<{ nonce: string }>('/api/security/nonce').then((r) => r.nonce)
    }
  },
  fx: {
    getUsdCnyRate() {
      return authedRequest<{ rate: number }>('/api/fx/usd-cny-rate').then((r) => r.rate)
    }
  },
  backtest: {
    historyList() {
      return authedRequest('/api/backtest/history')
    },
    historySave(result: BacktestResultDto, name?: string, dcaConfig?: string) {
      return postJson('/api/backtest/history', { result, name, dcaConfig })
    },
    historyDelete(id: string) {
      return authedRequest('/api/backtest/history', { method: 'DELETE', body: { id } })
    }
  },
  sync: {
    onStatusChange(callback: (status: SyncStatusDto) => void) {
      // The HTTP runtime has no push channel, so poll the sync status
      // endpoint and forward changes — mirrors the desktop IPC event.
      let lastSignature = ''
      const timer = setInterval(() => {
        authedRequest<SyncStatusDto>('/api/sync/status')
          .then((status) => {
            const signature = JSON.stringify(status)
            if (signature !== lastSignature) {
              lastSignature = signature
              callback(status)
            }
          })
          .catch(() => {})
      }, 2000)
      return () => clearInterval(timer)
    },
    syncData(direction: 'push' | 'pull' | 'bidirectional') {
      return postJson<SyncResultDto>('/api/sync/data', { direction })
    }
  },
  dividend: {
    getHistory(request?: DividendHistoryRequest): Promise<DividendHistoryResult> {
      return postJson<DividendHistoryResult>('/api/dividend/history', request ?? {})
    },
    listUpcoming(): Promise<UpcomingDividendDto[]> {
      return postJson<UpcomingDividendDto[]>('/api/dividend/upcoming', {})
    },
    getForecast(): Promise<DividendForecastDto> {
      return postJson<DividendForecastDto>('/api/dividend/forecast', {})
    }
  }
}
