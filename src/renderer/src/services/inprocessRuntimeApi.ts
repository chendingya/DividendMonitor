import type {
  AssetBacktestRequestDto,
  BacktestResultDto,
  ComparisonRowDto,
  DividendMonitorApi,
  StockDetailDto,
  StockSearchItemDto
} from '@shared/contracts/api'
import { createStockAssetQuery } from '@shared/contracts/api'
import { searchAssets } from '@main/application/useCases/searchAssets'
import { getAssetDetail } from '@main/application/useCases/getAssetDetail'
import { compareAssets } from '@main/application/useCases/compareAssets'
import { listWatchlist } from '@main/application/useCases/listWatchlist'
import { addWatchlistAsset } from '@main/application/useCases/addWatchlistAsset'
import { removeWatchlistAsset } from '@main/application/useCases/removeWatchlistAsset'
import { listWatchlistGroups } from '@main/application/useCases/listWatchlistGroups'
import { createWatchlistGroup } from '@main/application/useCases/createWatchlistGroup'
import { updateWatchlistGroup } from '@main/application/useCases/updateWatchlistGroup'
import { deleteWatchlistGroup } from '@main/application/useCases/deleteWatchlistGroup'
import { addAssetToWatchlistGroup } from '@main/application/useCases/addAssetToWatchlistGroup'
import { removeAssetFromWatchlistGroup } from '@main/application/useCases/removeAssetFromWatchlistGroup'
import { listWatchlistGroupAssets } from '@main/application/useCases/listWatchlistGroupAssets'
import { getAssetGroupIds as getAssetGroupIdsUseCase } from '@main/application/useCases/getAssetGroupIds'
import { getHistoricalYieldForAsset } from '@main/application/useCases/getHistoricalYieldForAsset'
import { estimateFutureYieldForAsset } from '@main/application/useCases/estimateFutureYieldForAsset'
import { runDividendReinvestmentBacktestForAsset } from '@main/application/useCases/runDividendReinvestmentBacktestForAsset'
import { listPortfolioPositions } from '@main/application/useCases/listPortfolioPositions'
import { upsertPortfolioPosition } from '@main/application/useCases/upsertPortfolioPosition'
import { removePortfolioPosition } from '@main/application/useCases/removePortfolioPosition'
import { removePortfolioPositionsByAsset } from '@main/application/useCases/removePortfolioPositionsByAsset'
import { replacePortfolioPositionsByAsset } from '@main/application/useCases/replacePortfolioPositionsByAsset'
import { getPortfolioRiskMetrics } from '@main/application/useCases/getPortfolioRiskMetrics'
import { getSettings } from '@main/application/useCases/getSettingsUseCase'
import { updateSettings, resetSettings } from '@main/application/useCases/updateSettingsUseCase'
import {
  getIndustryAnalysis,
  getIndustryDistribution,
  getIndustryBenchmark
} from '@main/application/useCases/getIndustryAnalysis'
import {
  listBacktestHistory,
  saveBacktestHistory,
  deleteBacktestHistory
} from '@main/application/useCases/backtestHistoryUseCases'
import { getUsdCnyRate as getUsdCnyRateUseCase } from '@main/application/useCases/getFxRateUseCase'
import { listHousingCities } from '@main/application/useCases/listHousingCities'
import { getHousingCityDetail } from '@main/application/useCases/getHousingCityDetail'
import { watchHousingCity, unwatchHousingCity } from '@main/application/useCases/toggleHousingWatchlist'
import { updateHousingUserData } from '@main/application/useCases/updateHousingUserData'
import { removeHousingUserData } from '@main/application/useCases/removeHousingUserData'
import { calculateMortgageUseCase } from '@main/application/useCases/calculateMortgage'
import { getCrossAssetComparison } from '@main/application/useCases/getCrossAssetComparison'
import { listDividendHistory } from '@main/application/useCases/listDividendHistory'
import { listUpcomingDividends } from '@main/application/useCases/listUpcomingDividends'
import { getDividendForecast } from '@main/application/useCases/getDividendForecast'
import { getMarketYieldMap, refreshMarketYieldMap } from '@main/application/useCases/getMarketYieldMap'
import { authService, subscribeAuthState, startAuthListener } from '@main/infrastructure/supabase/authService'
import { subscribeSyncStatus } from '@main/infrastructure/supabase/syncStatusNotifier'
import { syncData as runSyncData } from '@main/application/services/dataSyncService'

/**
 * Android 进程内运行时：渲染层直接调用 application 层用例，
 * 省去 HTTP 逐跳（browserHttpRuntimeApi）的 JSON 序列化与本地服务依赖。
 *
 * - 参数包装与 browserHttpRuntimeApi 保持一致（createStockAssetQuery 等）；
 * - DTO 对象直传，不再走 HTTP 错误信封（约定：错误直接抛出）；
 * - Capacitor 原生 SQLite 和 HTTP 初始化后，经 desktopApi 分支启用。
 */
export const inprocessRuntimeApi: DividendMonitorApi = {
  auth: {
    login(email, password) {
      return authService.login(email, password)
    },
    register(email, password) {
      return authService.register(email, password)
    },
    logout() {
      return authService.logout()
    },
    getSession() {
      return authService.getSession()
    },
    onAuthStateChange(callback) {
      // 确保 Supabase 登录态监听已启动（未配置 Supabase 时静默跳过），
      // 随后注册进程内订阅（不影响桌面端广播器注入位）。
      const unsubscribe = subscribeAuthState(callback)
      startAuthListener()
      return unsubscribe
    },
    updatePassword(newPassword) {
      return authService.updatePassword(newPassword)
    }
  },
  sync: {
    onStatusChange(callback) {
      return subscribeSyncStatus(callback)
    },
    syncData(direction) {
      return runSyncData(direction)
    }
  },
  asset: {
    search(request) {
      return searchAssets(request)
    },
    getDetail(request) {
      return getAssetDetail(request)
    },
    compare(request) {
      return compareAssets(request)
    }
  },
  stock: {
    async search(keyword: string): Promise<StockSearchItemDto[]> {
      return (await searchAssets({ keyword, assetTypes: ['STOCK'] })) as StockSearchItemDto[]
    },
    async getDetail(symbol: string): Promise<StockDetailDto> {
      return (await getAssetDetail(createStockAssetQuery(symbol))) as StockDetailDto
    },
    async compare(symbols: string[]): Promise<ComparisonRowDto[]> {
      return (await compareAssets({
        items: symbols.map((symbol) => createStockAssetQuery(symbol))
      })) as ComparisonRowDto[]
    }
  },
  watchlist: {
    list() {
      return listWatchlist()
    },
    add(symbol) {
      return addWatchlistAsset(createStockAssetQuery(symbol))
    },
    remove(symbol) {
      return removeWatchlistAsset(createStockAssetQuery(symbol).assetKey!)
    },
    addAsset(request) {
      return addWatchlistAsset(request)
    },
    removeAsset(assetKey) {
      return removeWatchlistAsset(assetKey)
    },
    listGroups() {
      return listWatchlistGroups()
    },
    createGroup(request) {
      return createWatchlistGroup(request)
    },
    updateGroup(id, request) {
      return updateWatchlistGroup(id, request)
    },
    deleteGroup(id) {
      return deleteWatchlistGroup(id)
    },
    addToGroup(request) {
      return addAssetToWatchlistGroup(request)
    },
    removeFromGroup(request) {
      return removeAssetFromWatchlistGroup(request)
    },
    listGroupAssets(groupId) {
      return listWatchlistGroupAssets(groupId)
    },
    getAssetGroupIds(assetKey) {
      return getAssetGroupIdsUseCase(assetKey)
    }
  },
  calculation: {
    getHistoricalYield(symbol) {
      return getHistoricalYieldForAsset(createStockAssetQuery(symbol))
    },
    estimateFutureYield(symbol) {
      return estimateFutureYieldForAsset(createStockAssetQuery(symbol))
    },
    runDividendReinvestmentBacktest(symbol, buyDate) {
      return runDividendReinvestmentBacktestForAsset({
        asset: createStockAssetQuery(symbol),
        buyDate
      } satisfies AssetBacktestRequestDto)
    },
    getHistoricalYieldForAsset(request) {
      return getHistoricalYieldForAsset(request)
    },
    estimateFutureYieldForAsset(request) {
      return estimateFutureYieldForAsset(request)
    },
    runDividendReinvestmentBacktestForAsset(request: AssetBacktestRequestDto): Promise<BacktestResultDto> {
      return runDividendReinvestmentBacktestForAsset(request)
    }
  },
  portfolio: {
    list() {
      return listPortfolioPositions()
    },
    upsert(request) {
      return upsertPortfolioPosition(request)
    },
    remove(id) {
      return removePortfolioPosition(id)
    },
    removeByAsset(request) {
      return removePortfolioPositionsByAsset(request)
    },
    replaceByAsset(request) {
      return replacePortfolioPositionsByAsset(request)
    },
    getRiskMetrics(request) {
      return getPortfolioRiskMetrics(request)
    }
  },
  settings: {
    async get() {
      return getSettings()
    },
    async update(partial) {
      return updateSettings(partial)
    },
    async reset() {
      return resetSettings()
    }
  },
  backup: {
    async createBackup() {
      throw new Error('备份恢复仅桌面版支持')
    },
    async restoreBackup() {
      throw new Error('备份恢复仅桌面版支持')
    }
  },
  industry: {
    getAnalysis(industryName, assetKeys) {
      return getIndustryAnalysis(industryName, assetKeys)
    },
    getDistribution() {
      return getIndustryDistribution()
    },
    getBenchmark(industryName) {
      return getIndustryBenchmark(industryName)
    }
  },
  backtest: {
    async historyList() {
      return listBacktestHistory()
    },
    async historySave(result, name, dcaConfig) {
      return saveBacktestHistory(result, name, dcaConfig)
    },
    async historyDelete(id) {
      return deleteBacktestHistory(id)
    }
  },
  security: {
    async getLocalNonce() {
      // 进程内无服务端，nonce 机制不存在，返回固定值
      return 'inprocess'
    }
  },
  fx: {
    getUsdCnyRate() {
      // 与 fxRoutes 兜底语义一致：用例抛错时返回固定汇率 7.2
      return getUsdCnyRateUseCase().catch(() => 7.2)
    }
  },
  housing: {
    listCities() {
      return listHousingCities()
    },
    getCityDetail(city) {
      return getHousingCityDetail(city)
    },
    async watchCity(city) {
      await watchHousingCity(city)
    },
    async unwatchCity(city) {
      await unwatchHousingCity(city)
    },
    async updateUserData(request) {
      await updateHousingUserData(request)
    },
    async removeUserData(city) {
      await removeHousingUserData(city)
    },
    async calculateMortgage(request) {
      return calculateMortgageUseCase(request)
    }
  },
  crossAsset: {
    getComparison() {
      return getCrossAssetComparison()
    }
  },
  dividend: {
    getHistory(request) {
      return listDividendHistory(request)
    },
    listUpcoming() {
      return listUpcomingDividends()
    },
    getForecast() {
      return getDividendForecast()
    }
  },
  yieldMap: {
    get() {
      return getMarketYieldMap()
    },
    refresh() {
      return refreshMarketYieldMap()
    }
  }
}
