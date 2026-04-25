import { getDatabase } from '@main/infrastructure/db/sqlite'

function normalizeSymbol(symbol: string) {
  return symbol.trim()
}

function isAShareSymbol(symbol: string) {
  return /^(6|0|3)\d{5}$/.test(symbol)
}

function sanitizeSymbols(symbols: string[]) {
  const seen = new Set<string>()

  return symbols
    .map(normalizeSymbol)
    .filter((symbol) => isAShareSymbol(symbol))
    .filter((symbol) => {
      if (seen.has(symbol)) {
        return false
      }
      seen.add(symbol)
      return true
    })
}

export class WatchlistRepository {
  async listSymbols() {
    const db = getDatabase()
    const rows = db
      .prepare(
        `
          SELECT symbol
          FROM watchlist_items
          ORDER BY updated_at DESC, created_at DESC, symbol ASC
        `
      )
      .all() as Array<{ symbol: string }>

    return sanitizeSymbols(rows.map((row) => row.symbol))
  }

  async addSymbol(symbol: string) {
    const normalized = normalizeSymbol(symbol)
    if (!isAShareSymbol(normalized)) {
      throw new Error(`Only A-share 6-digit symbols are supported: ${symbol}`)
    }

    const db = getDatabase()
    const now = new Date().toISOString()

    db.prepare(
      `
        INSERT INTO watchlist_items (symbol, created_at, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
          updated_at = excluded.updated_at
      `
    ).run(normalized, now, now)
  }

  async removeSymbol(symbol: string) {
    const normalized = normalizeSymbol(symbol)
    const db = getDatabase()
    db.prepare('DELETE FROM watchlist_items WHERE symbol = ?').run(normalized)
  }
}
