const LAST_SYMBOL_KEY = 'dm:last-symbol'
const LAST_COMPARISON_SYMBOLS_KEY = 'dm:last-comparison-symbols'
const LAST_WATCHLIST_SELECTIONS_KEY = 'dm:last-watchlist-selections'
const RECENT_SYMBOLS_KEY = 'dm:recent-symbols'

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function normalizeSymbol(symbol: string) {
  return symbol.trim()
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

export function parseSymbolFromSearch(searchParams: URLSearchParams) {
  const raw = searchParams.get('symbol')
  if (!raw) {
    return null
  }
  const symbol = normalizeSymbol(raw)
  return symbol.length > 0 ? symbol : null
}

export function parseSymbolsFromSearch(searchParams: URLSearchParams) {
  const raw = searchParams.get('symbols')
  if (!raw) {
    return []
  }
  return normalizeSymbols(raw.split(','))
}

export function buildStockDetailPath(symbol: string, compareSymbols?: string[]) {
  const params = new URLSearchParams()
  params.set('symbol', normalizeSymbol(symbol))
  const normalizedCompareSymbols = compareSymbols ? normalizeSymbols(compareSymbols) : []
  if (normalizedCompareSymbols.length > 0) {
    params.set('symbols', normalizedCompareSymbols.join(','))
  }
  return `/stock-detail?${params.toString()}`
}

export function buildComparisonPath(symbols: string[]) {
  const params = new URLSearchParams()
  const normalizedSymbols = normalizeSymbols(symbols)
  if (normalizedSymbols.length > 0) {
    params.set('symbols', normalizedSymbols.join(','))
  }
  const query = params.toString()
  return query ? `/comparison?${query}` : '/comparison'
}

export function buildBacktestPath(symbol: string) {
  const params = new URLSearchParams()
  params.set('symbol', normalizeSymbol(symbol))
  return `/backtest?${params.toString()}`
}

export function rememberLastSymbol(symbol: string) {
  const normalized = normalizeSymbol(symbol)
  if (!normalized || !canUseSessionStorage()) {
    return
  }
  window.sessionStorage.setItem(LAST_SYMBOL_KEY, normalized)
}

export function getRememberedLastSymbol() {
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

export function rememberComparisonSymbols(symbols: string[]) {
  const normalized = normalizeSymbols(symbols)
  if (normalized.length === 0 || !canUseSessionStorage()) {
    return
  }
  window.sessionStorage.setItem(LAST_COMPARISON_SYMBOLS_KEY, normalized.join(','))
}

export function getRememberedComparisonSymbols() {
  if (!canUseSessionStorage()) {
    return []
  }
  const value = window.sessionStorage.getItem(LAST_COMPARISON_SYMBOLS_KEY)
  if (!value) {
    return []
  }
  return normalizeSymbols(value.split(','))
}

export function rememberWatchlistSelections(symbols: string[]) {
  if (!canUseSessionStorage()) {
    return
  }

  const normalized = normalizeSymbols(symbols)
  if (normalized.length === 0) {
    window.sessionStorage.removeItem(LAST_WATCHLIST_SELECTIONS_KEY)
    return
  }

  window.sessionStorage.setItem(LAST_WATCHLIST_SELECTIONS_KEY, normalized.join(','))
}

export function getRememberedWatchlistSelections() {
  if (!canUseSessionStorage()) {
    return []
  }

  const value = window.sessionStorage.getItem(LAST_WATCHLIST_SELECTIONS_KEY)
  if (!value) {
    return []
  }

  return normalizeSymbols(value.split(',')).slice(0, 10)
}

export function rememberRecentSymbol(symbol: string) {
  const normalized = normalizeSymbol(symbol)
  if (!normalized || !canUseSessionStorage()) {
    return
  }
  const recent = getRecentSymbols().filter((item) => item !== normalized)
  recent.unshift(normalized)
  window.sessionStorage.setItem(RECENT_SYMBOLS_KEY, recent.slice(0, 10).join(','))
}

export function getRecentSymbols() {
  if (!canUseSessionStorage()) {
    return []
  }
  const value = window.sessionStorage.getItem(RECENT_SYMBOLS_KEY)
  if (!value) {
    return []
  }
  return normalizeSymbols(value.split(',')).slice(0, 10)
}
