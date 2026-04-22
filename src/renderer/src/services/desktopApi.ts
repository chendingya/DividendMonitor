import type { DividendMonitorApi } from '@shared/contracts/api'

function ensureDesktopApi(): DividendMonitorApi {
  const api = window.dividendMonitor

  if (!api) {
    throw new Error('Desktop bridge is unavailable. Please launch the app inside Electron instead of opening the renderer directly in a browser.')
  }

  return api
}

export function getStockDesktopApi() {
  const api = ensureDesktopApi()

  if (!api.stock) {
    throw new Error('Desktop bridge is missing the stock API namespace.')
  }

  return api.stock
}

export function getWatchlistDesktopApi() {
  const api = ensureDesktopApi()

  if (!api.watchlist) {
    throw new Error('Desktop bridge is missing the watchlist API namespace.')
  }

  return api.watchlist
}

export function getCalculationDesktopApi() {
  const api = ensureDesktopApi()

  if (!api.calculation) {
    throw new Error('Desktop bridge is missing the calculation API namespace.')
  }

  return api.calculation
}
