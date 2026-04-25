import type { DividendMonitorApi } from '@shared/contracts/api'
import { browserRuntimeApi } from '@renderer/services/browserRuntimeApi'

function getRuntimeApi(): DividendMonitorApi {
  const api = window.dividendMonitor

  if (!api) {
    return browserRuntimeApi
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
