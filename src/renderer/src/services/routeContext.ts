import { buildStockAssetKey, normalizeAssetCode, parseAssetKey } from '@shared/contracts/api'

const LAST_ASSET_KEY_KEY = 'dm:last-asset-key'
const LAST_ASSET_COMPARISON_KEYS_KEY = 'dm:last-comparison-asset-keys'
const LAST_WATCHLIST_ASSET_SELECTIONS_KEY = 'dm:last-watchlist-asset-selections'
const RECENT_ASSET_KEYS_KEY = 'dm:recent-asset-keys'

const LAST_SYMBOL_KEY = 'dm:last-symbol'
const LAST_COMPARISON_SYMBOLS_KEY = 'dm:last-comparison-symbols'
const LAST_WATCHLIST_SELECTIONS_KEY = 'dm:last-watchlist-selections'
const RECENT_SYMBOLS_KEY = 'dm:recent-symbols'

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function normalizeSymbol(symbol: string) {
  return normalizeAssetCode(symbol)
}

function normalizeSymbols(symbols: string[]) {
  const seen = new Set<string>()
  return symbols
    .map((item) => normalizeSymbol(item))
    .filter((item) => item.length > 0)
    .filter((item) => {
      if (seen.has(item)) {
        return false
      }
      seen.add(item)
      return true
    })
}

function normalizeAssetKey(assetKey: string) {
  return assetKey.trim()
}

function normalizeAssetKeys(assetKeys: string[]) {
  const seen = new Set<string>()
  return assetKeys
    .map((item) => normalizeAssetKey(item))
    .filter((item) => item.length > 0)
    .filter((item) => {
      if (seen.has(item)) {
        return false
      }
      seen.add(item)
      return true
    })
}

function assetKeyToStockSymbol(assetKey: string) {
  const parsed = parseAssetKey(assetKey)
  if (!parsed || parsed.assetType !== 'STOCK') {
    return null
  }
  return parsed.code
}

function symbolsToAssetKeys(symbols: string[]) {
  return normalizeSymbols(symbols).map((symbol) => buildStockAssetKey(symbol))
}

function assetKeysToSymbols(assetKeys: string[]) {
  return normalizeAssetKeys(assetKeys)
    .map(assetKeyToStockSymbol)
    .filter((symbol): symbol is string => symbol != null)
}

export function parseSymbolFromSearch(searchParams: URLSearchParams) {
  const assetKey = parseAssetKeyFromSearch(searchParams)
  const symbolFromAssetKey = assetKey ? assetKeyToStockSymbol(assetKey) : null
  if (symbolFromAssetKey) {
    return symbolFromAssetKey
  }

  const raw = searchParams.get('symbol')
  if (!raw) {
    return null
  }
  const symbol = normalizeSymbol(raw)
  return symbol.length > 0 ? symbol : null
}

export function parseSymbolsFromSearch(searchParams: URLSearchParams) {
  const assetKeys = parseAssetKeysFromSearch(searchParams)
  if (assetKeys.length > 0) {
    return assetKeysToSymbols(assetKeys)
  }

  const raw = searchParams.get('symbols')
  if (!raw) {
    return []
  }
  return normalizeSymbols(raw.split(','))
}

export function parseAssetKeyFromSearch(searchParams: URLSearchParams) {
  const raw = searchParams.get('assetKey')
  if (!raw) {
    return null
  }
  const assetKey = normalizeAssetKey(raw)
  return assetKey.length > 0 ? assetKey : null
}

export function parseAssetKeysFromSearch(searchParams: URLSearchParams) {
  const raw = searchParams.get('assetKeys')
  if (!raw) {
    return []
  }
  return normalizeAssetKeys(raw.split(','))
}

export function buildAssetDetailPath(assetKey: string, compareAssetKeys?: string[]) {
  const params = new URLSearchParams()
  const normalizedAssetKey = normalizeAssetKey(assetKey)
  params.set('assetKey', normalizedAssetKey)

  const symbol = assetKeyToStockSymbol(normalizedAssetKey)
  if (symbol) {
    params.set('symbol', symbol)
  }

  const normalizedCompareAssetKeys = compareAssetKeys ? normalizeAssetKeys(compareAssetKeys) : []
  if (normalizedCompareAssetKeys.length > 0) {
    params.set('assetKeys', normalizedCompareAssetKeys.join(','))
    const compareSymbols = assetKeysToSymbols(normalizedCompareAssetKeys)
    if (compareSymbols.length > 0) {
      params.set('symbols', compareSymbols.join(','))
    }
  }

  return `/stock-detail?${params.toString()}`
}

export function buildStockDetailPath(symbol: string, compareSymbols?: string[]) {
  return buildAssetDetailPath(buildStockAssetKey(symbol), compareSymbols ? symbolsToAssetKeys(compareSymbols) : undefined)
}

export function buildComparisonPathFromAssetKeys(assetKeys: string[]) {
  const params = new URLSearchParams()
  const normalizedAssetKeys = normalizeAssetKeys(assetKeys)
  if (normalizedAssetKeys.length > 0) {
    params.set('assetKeys', normalizedAssetKeys.join(','))
  }

  const symbols = assetKeysToSymbols(normalizedAssetKeys)
  if (symbols.length > 0) {
    params.set('symbols', symbols.join(','))
  }

  const query = params.toString()
  return query ? `/comparison?${query}` : '/comparison'
}

export function buildComparisonPath(symbols: string[]) {
  return buildComparisonPathFromAssetKeys(symbolsToAssetKeys(symbols))
}

export function buildAssetSearchPath(keyword: string) {
  const normalized = normalizeAssetCode(keyword)
  const params = new URLSearchParams()
  if (normalized) {
    params.set('keyword', normalized)
  }

  const query = params.toString()
  return query ? `/search?${query}` : '/search'
}

export function buildBacktestPathFromAssetKey(assetKey: string) {
  const params = new URLSearchParams()
  const normalizedAssetKey = normalizeAssetKey(assetKey)
  params.set('assetKey', normalizedAssetKey)

  const symbol = assetKeyToStockSymbol(normalizedAssetKey)
  if (symbol) {
    params.set('symbol', symbol)
  }

  return `/backtest?${params.toString()}`
}

export function buildBacktestPath(symbol: string) {
  return buildBacktestPathFromAssetKey(buildStockAssetKey(symbol))
}

export function rememberLastAssetKey(assetKey: string) {
  const normalized = normalizeAssetKey(assetKey)
  if (!normalized || !canUseSessionStorage()) {
    return
  }
  window.sessionStorage.setItem(LAST_ASSET_KEY_KEY, normalized)
}

export function rememberLastSymbol(symbol: string) {
  const normalized = normalizeSymbol(symbol)
  if (!normalized || !canUseSessionStorage()) {
    return
  }
  rememberLastAssetKey(buildStockAssetKey(normalized))
  window.sessionStorage.setItem(LAST_SYMBOL_KEY, normalized)
}

export function getRememberedLastAssetKey() {
  if (!canUseSessionStorage()) {
    return null
  }

  const assetKey = window.sessionStorage.getItem(LAST_ASSET_KEY_KEY)
  if (assetKey) {
    const normalized = normalizeAssetKey(assetKey)
    return normalized.length > 0 ? normalized : null
  }

  const legacySymbol = window.sessionStorage.getItem(LAST_SYMBOL_KEY)
  if (!legacySymbol) {
    return null
  }

  const normalizedSymbol = normalizeSymbol(legacySymbol)
  return normalizedSymbol ? buildStockAssetKey(normalizedSymbol) : null
}

export function getRememberedLastSymbol() {
  const assetKey = getRememberedLastAssetKey()
  if (assetKey) {
    const symbol = assetKeyToStockSymbol(assetKey)
    if (symbol) {
      return symbol
    }
  }

  if (!canUseSessionStorage()) {
    return null
  }

  const value = window.sessionStorage.getItem(LAST_SYMBOL_KEY)
  if (!value) {
    return null
  }
  const normalized = normalizeSymbol(value)
  return normalized.length > 0 ? normalized : null
}

export function rememberComparisonAssetKeys(assetKeys: string[]) {
  const normalized = normalizeAssetKeys(assetKeys)
  if (normalized.length === 0 || !canUseSessionStorage()) {
    return
  }

  window.sessionStorage.setItem(LAST_ASSET_COMPARISON_KEYS_KEY, normalized.join(','))
}

export function rememberComparisonSymbols(symbols: string[]) {
  const normalized = normalizeSymbols(symbols)
  if (normalized.length === 0 || !canUseSessionStorage()) {
    return
  }
  rememberComparisonAssetKeys(symbolsToAssetKeys(normalized))
  window.sessionStorage.setItem(LAST_COMPARISON_SYMBOLS_KEY, normalized.join(','))
}

export function getRememberedComparisonAssetKeys() {
  if (!canUseSessionStorage()) {
    return []
  }

  const value = window.sessionStorage.getItem(LAST_ASSET_COMPARISON_KEYS_KEY)
  if (value) {
    return normalizeAssetKeys(value.split(','))
  }

  const legacy = window.sessionStorage.getItem(LAST_COMPARISON_SYMBOLS_KEY)
  return legacy ? symbolsToAssetKeys(legacy.split(',')) : []
}

export function getRememberedComparisonSymbols() {
  const assetKeys = getRememberedComparisonAssetKeys()
  if (assetKeys.length > 0) {
    return assetKeysToSymbols(assetKeys)
  }

  if (!canUseSessionStorage()) {
    return []
  }
  const value = window.sessionStorage.getItem(LAST_COMPARISON_SYMBOLS_KEY)
  if (!value) {
    return []
  }
  return normalizeSymbols(value.split(','))
}

export function rememberWatchlistAssetSelections(assetKeys: string[]) {
  if (!canUseSessionStorage()) {
    return
  }

  const normalized = normalizeAssetKeys(assetKeys)
  if (normalized.length === 0) {
    window.sessionStorage.removeItem(LAST_WATCHLIST_ASSET_SELECTIONS_KEY)
    return
  }

  window.sessionStorage.setItem(LAST_WATCHLIST_ASSET_SELECTIONS_KEY, normalized.join(','))
}

export function rememberWatchlistSelections(symbols: string[]) {
  if (!canUseSessionStorage()) {
    return
  }

  const normalized = normalizeSymbols(symbols)
  rememberWatchlistAssetSelections(symbolsToAssetKeys(normalized))
  if (normalized.length === 0) {
    window.sessionStorage.removeItem(LAST_WATCHLIST_SELECTIONS_KEY)
    return
  }

  window.sessionStorage.setItem(LAST_WATCHLIST_SELECTIONS_KEY, normalized.join(','))
}

export function getRememberedWatchlistAssetSelections() {
  if (!canUseSessionStorage()) {
    return []
  }

  const value = window.sessionStorage.getItem(LAST_WATCHLIST_ASSET_SELECTIONS_KEY)
  if (value) {
    return normalizeAssetKeys(value.split(',')).slice(0, 10)
  }

  const legacy = window.sessionStorage.getItem(LAST_WATCHLIST_SELECTIONS_KEY)
  return legacy ? symbolsToAssetKeys(legacy.split(',')).slice(0, 10) : []
}

export function getRememberedWatchlistSelections() {
  const assetKeys = getRememberedWatchlistAssetSelections()
  if (assetKeys.length > 0) {
    return assetKeysToSymbols(assetKeys).slice(0, 10)
  }

  if (!canUseSessionStorage()) {
    return []
  }

  const value = window.sessionStorage.getItem(LAST_WATCHLIST_SELECTIONS_KEY)
  if (!value) {
    return []
  }

  return normalizeSymbols(value.split(',')).slice(0, 10)
}

export function rememberRecentAssetKey(assetKey: string) {
  const normalized = normalizeAssetKey(assetKey)
  if (!normalized || !canUseSessionStorage()) {
    return
  }
  const recent = getRecentAssetKeys().filter((item) => item !== normalized)
  recent.unshift(normalized)
  window.sessionStorage.setItem(RECENT_ASSET_KEYS_KEY, recent.slice(0, 10).join(','))
}

export function rememberRecentSymbol(symbol: string) {
  const normalized = normalizeSymbol(symbol)
  if (!normalized || !canUseSessionStorage()) {
    return
  }
  rememberRecentAssetKey(buildStockAssetKey(normalized))
  const recent = getRecentSymbols().filter((item) => item !== normalized)
  recent.unshift(normalized)
  window.sessionStorage.setItem(RECENT_SYMBOLS_KEY, recent.slice(0, 10).join(','))
}

export function getRecentAssetKeys() {
  if (!canUseSessionStorage()) {
    return []
  }

  const value = window.sessionStorage.getItem(RECENT_ASSET_KEYS_KEY)
  if (value) {
    return normalizeAssetKeys(value.split(',')).slice(0, 10)
  }

  const legacy = window.sessionStorage.getItem(RECENT_SYMBOLS_KEY)
  return legacy ? symbolsToAssetKeys(legacy.split(',')).slice(0, 10) : []
}

export function getRecentSymbols() {
  const assetKeys = getRecentAssetKeys()
  if (assetKeys.length > 0) {
    return assetKeysToSymbols(assetKeys).slice(0, 10)
  }

  if (!canUseSessionStorage()) {
    return []
  }
  const value = window.sessionStorage.getItem(RECENT_SYMBOLS_KEY)
  if (!value) {
    return []
  }
  return normalizeSymbols(value.split(',')).slice(0, 10)
}
