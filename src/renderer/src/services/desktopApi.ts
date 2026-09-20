import type { DividendMonitorApi } from '@shared/contracts/api'
import { browserHttpRuntimeApi } from '@renderer/services/browserHttpRuntimeApi'
import { browserRuntimeApi } from '@renderer/services/browserRuntimeApi'
import { isNativeRuntime } from '@renderer/services/nativeRuntime'
let inprocessApi: DividendMonitorApi | undefined
let initialization: Promise<void> | undefined

export function isInprocessRuntime(): boolean {
  return !window.dividendMonitor && (isNativeRuntime() || new URLSearchParams(window.location.search).get('runtime') === 'inprocess')
}

/** React 挂载前完成初始化，桌面/HTTP/mock 不加载 main 用例依赖图。 */
export function initializeRuntime(): Promise<void> {
  if (!isInprocessRuntime()) return Promise.resolve()
  return initialization ??= (async () => {
    const { initializeNativeRuntime } = await import('@renderer/services/nativeRuntime')
    await initializeNativeRuntime()
    inprocessApi = (await import('@renderer/services/inprocessRuntimeApi')).inprocessRuntimeApi
  })()
}

function getRuntimeApi(): DividendMonitorApi {
  const api = window.dividendMonitor

  if (isInprocessRuntime()) {
    if (!inprocessApi) throw new Error('运行时尚未初始化')
    return inprocessApi
  }

  if (!api && new URLSearchParams(window.location.search).get('runtime') === 'mock') {
    return browserRuntimeApi
  }

  if (!api) {
    return browserHttpRuntimeApi
  }

  return api
}

export function getStockDesktopApi() {
  const api = getRuntimeApi()

  if (!api.stock) {
    throw new Error('Runtime API is missing the stock namespace.')
  }

  return api.stock
}

export function getAssetDesktopApi() {
  const api = getRuntimeApi()

  if (!api.asset) {
    throw new Error('Runtime API is missing the asset namespace.')
  }

  return api.asset
}

export function getWatchlistDesktopApi() {
  const api = getRuntimeApi()

  if (!api.watchlist) {
    throw new Error('Runtime API is missing the watchlist namespace.')
  }

  return api.watchlist
}

export function getCalculationDesktopApi() {
  const api = getRuntimeApi()

  if (!api.calculation) {
    throw new Error('Runtime API is missing the calculation namespace.')
  }

  return api.calculation
}

export function getAuthDesktopApi() {
  const api = getRuntimeApi()

  if (!api.auth) {
    throw new Error('Runtime API is missing the auth namespace.')
  }

  return api.auth
}

export function getPortfolioDesktopApi() {
  const api = getRuntimeApi()

  if (!api.portfolio) {
    throw new Error('Runtime API is missing the portfolio namespace.')
  }

  return api.portfolio
}

export function getIndustryDesktopApi() {
  const api = getRuntimeApi()

  if (!api.industry) {
    throw new Error('Runtime API is missing the industry namespace.')
  }

  return api.industry
}

export function getSettingsDesktopApi() {
  const api = getRuntimeApi()

  if (!api.settings) {
    throw new Error('Runtime API is missing the settings namespace.')
  }

  return api.settings
}

export function getSyncDesktopApi() {
  const api = getRuntimeApi()

  if (!api.sync) {
    throw new Error('Runtime API is missing the sync namespace.')
  }

  return api.sync
}

export function getBacktestDesktopApi() {
  const api = getRuntimeApi()

  if (!api.backtest) {
    throw new Error('Runtime API is missing the backtest namespace.')
  }

  return api.backtest
}

export function getFxDesktopApi() {
  const api = getRuntimeApi()

  if (!api.fx) {
    throw new Error('Runtime API is missing the fx namespace.')
  }

  return api.fx
}

export function getDividendDesktopApi(): DividendMonitorApi['dividend'] {
  const api = getRuntimeApi()

  if (!api.dividend) {
    throw new Error('Runtime API is missing the dividend namespace.')
  }

  return api.dividend
}

export function getYieldMapDesktopApi(): DividendMonitorApi['yieldMap'] {
  const api = getRuntimeApi()

  if (!api.yieldMap) {
    throw new Error('Runtime API is missing the yieldMap namespace.')
  }

  return api.yieldMap
}

export function getHousingDesktopApi(): DividendMonitorApi['housing'] {
  const api = getRuntimeApi()

  if (!api.housing) {
    throw new Error('Runtime API is missing the housing namespace.')
  }

  return api.housing
}

export function getCrossAssetDesktopApi(): DividendMonitorApi['crossAsset'] {
  const api = getRuntimeApi()

  if (!api.crossAsset) {
    throw new Error('Runtime API is missing the crossAsset namespace.')
  }

  return api.crossAsset
}

export function getBackupDesktopApi(): DividendMonitorApi['backup'] {
  const api = getRuntimeApi()

  if (!api.backup) {
    throw new Error('Runtime API is missing the backup namespace.')
  }

  return api.backup
}
