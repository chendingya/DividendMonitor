import type { DividendMonitorApi } from '@shared/contracts/api'
import { browserHttpRuntimeApi } from '@renderer/services/browserHttpRuntimeApi'
import { browserRuntimeApi } from '@renderer/services/browserRuntimeApi'

function getRuntimeApi(): DividendMonitorApi {
  const api = window.dividendMonitor

  if (!api && window.location.search.includes('runtime=mock')) {
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

export function getSyncDesktopApi() {
  const api = getRuntimeApi()

  if (!api.sync) {
    throw new Error('Runtime API is missing the sync namespace.')
  }

  return api.sync
}
