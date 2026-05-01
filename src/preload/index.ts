import { contextBridge, ipcRenderer } from 'electron'
import type {
  AssetCompareRequestDto,
  AssetQueryDto,
  AssetSearchRequestDto,
  AssetBacktestRequestDto,
  AuthSessionDto,
  PortfolioPositionUpsertDto,
  PortfolioPositionReplaceByAssetDto,
  SyncStatusDto
} from '@shared/contracts/api'

/**
 * Unwrap IPC results that use the `{ __ipcError }` pattern to avoid
 * structured-clone garbling of Chinese characters in Error messages.
 */
function unwrapIpc<T>(result: T | { __ipcError: string }): T {
  if (result && typeof result === 'object' && '__ipcError' in result) {
    throw new Error((result as { __ipcError: string }).__ipcError)
  }
  return result as T
}

const api = {
  auth: {
    login: (email: string, password: string) => ipcRenderer.invoke('auth:login', { email, password }).then(unwrapIpc),
    register: (email: string, password: string) => ipcRenderer.invoke('auth:register', { email, password }).then(unwrapIpc),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    updatePassword: (newPassword: string) => ipcRenderer.invoke('auth:update-password', { newPassword }).then(unwrapIpc),
    onAuthStateChange: (callback: (session: AuthSessionDto) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, session: AuthSessionDto) => callback(session)
      ipcRenderer.on('auth:state-changed', handler)
      return () => { ipcRenderer.removeListener('auth:state-changed', handler) }
    }
  },
  sync: {
    onStatusChange: (callback: (status: SyncStatusDto) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: SyncStatusDto) => callback(status)
      ipcRenderer.on('sync:status-changed', handler)
      return () => { ipcRenderer.removeListener('sync:status-changed', handler) }
    },
    syncData: (direction: 'push' | 'pull' | 'bidirectional') => ipcRenderer.invoke('sync:data', direction)
  },
  asset: {
    search: (request: AssetSearchRequestDto) => ipcRenderer.invoke('asset:search', request),
    getDetail: (request: AssetQueryDto) => ipcRenderer.invoke('asset:get-detail', request),
    compare: (request: AssetCompareRequestDto) => ipcRenderer.invoke('asset:compare', request)
  },
  stock: {
    search: (keyword: string) => ipcRenderer.invoke('stock:search', keyword),
    getDetail: (symbol: string) => ipcRenderer.invoke('stock:get-detail', symbol),
    compare: (symbols: string[]) => ipcRenderer.invoke('stock:compare', symbols)
  },
  watchlist: {
    list: () => ipcRenderer.invoke('watchlist:list'),
    add: (symbol: string) => ipcRenderer.invoke('watchlist:add', symbol),
    remove: (symbol: string) => ipcRenderer.invoke('watchlist:remove', symbol),
    addAsset: (request: AssetQueryDto & { name?: string }) => ipcRenderer.invoke('watchlist:add-asset', request),
    removeAsset: (assetKey: string) => ipcRenderer.invoke('watchlist:remove-asset', assetKey)
  },
  calculation: {
    getHistoricalYield: (symbol: string) => ipcRenderer.invoke('calculation:historical-yield', symbol),
    estimateFutureYield: (symbol: string) => ipcRenderer.invoke('calculation:estimate-future-yield', symbol),
    runDividendReinvestmentBacktest: (symbol: string, buyDate: string) =>
      ipcRenderer.invoke('calculation:run-dividend-reinvestment-backtest', symbol, buyDate),
    getHistoricalYieldForAsset: (request: AssetQueryDto) => ipcRenderer.invoke('calculation:historical-yield-for-asset', request),
    estimateFutureYieldForAsset: (request: AssetQueryDto) => ipcRenderer.invoke('calculation:estimate-future-yield-for-asset', request),
    runDividendReinvestmentBacktestForAsset: (request: AssetBacktestRequestDto) =>
      ipcRenderer.invoke('calculation:run-dividend-reinvestment-backtest-for-asset', request)
  },
  portfolio: {
    list: () => ipcRenderer.invoke('portfolio:list'),
    upsert: (request: PortfolioPositionUpsertDto) => ipcRenderer.invoke('portfolio:upsert', request),
    remove: (id: string) => ipcRenderer.invoke('portfolio:remove', id),
    removeByAsset: (request: AssetQueryDto) => ipcRenderer.invoke('portfolio:remove-by-asset', request),
    replaceByAsset: (request: PortfolioPositionReplaceByAssetDto) => ipcRenderer.invoke('portfolio:replace-by-asset', request),
    getRiskMetrics: (request: { items: Array<{ assetKey: string; marketValue: number }> }) => ipcRenderer.invoke('portfolio:getRiskMetrics', request)
  },
  industry: {
    getAnalysis: (industryName?: string, assetKeys?: string[]) =>
      ipcRenderer.invoke('industry:analysis', industryName, assetKeys),
    getDistribution: () => ipcRenderer.invoke('industry:distribution')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (partial: Record<string, unknown>) => ipcRenderer.invoke('settings:update', partial),
    reset: () => ipcRenderer.invoke('settings:reset')
  },
  security: {
    getLocalNonce: () => ipcRenderer.invoke('security:getLocalNonce')
  }
}

contextBridge.exposeInMainWorld('dividendMonitor', api)
