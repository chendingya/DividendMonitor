import { getDatabase } from '@main/infrastructure/db/sqlite'
import type { AssetIdentifierDto, AssetKey, AssetType, MarketCode } from '@shared/contracts/api'
import { buildAssetKey, buildStockAssetKey, normalizeAssetCode, parseAssetKey } from '@shared/contracts/api'
import type { IWatchlistRepository, WatchlistAssetRecord } from '@main/repositories/interfaces'

export type { WatchlistAssetRecord } from '@main/repositories/interfaces'

function normalizeSymbol(symbol: string) {
  return normalizeAssetCode(symbol)
}

function isAShareSymbol(symbol: string) {
  return /^(6|0|3)\d{5}$/.test(symbol)
}

function isAShareAssetCode(code: string) {
  return /^\d{6}$/.test(code)
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

export class WatchlistRepository implements IWatchlistRepository {
  async listAssets(): Promise<WatchlistAssetRecord[]> {
    const db = getDatabase()
    const rows = db
      .prepare(
        `
          SELECT asset_key, asset_type, market, code, name
          FROM watchlist_items
          ORDER BY updated_at DESC, created_at DESC, code ASC
        `
      )
      .all() as Array<{
      asset_key: string
      asset_type: AssetType
      market: MarketCode
      code: string
      name?: string | null
    }>

    const assets: WatchlistAssetRecord[] = []
    for (const row of rows) {
      const assetKey = row.asset_key.trim()
      const parsed = parseAssetKey(assetKey)
      if (!parsed) {
        continue
      }

      assets.push({
        assetKey,
        assetType: row.asset_type ?? parsed.assetType,
        market: row.market ?? parsed.market,
        code: normalizeAssetCode(row.code ?? parsed.code),
        name: row.name ?? undefined
      })
    }

    return assets
  }

  async listSymbols() {
    const assets = await this.listAssets()
    return sanitizeSymbols(
      assets
        .filter((asset) => asset.assetType === 'STOCK' && asset.market === 'A_SHARE')
        .map((asset) => asset.code)
    )
  }

  async addAsset(asset: AssetIdentifierDto & { name?: string }) {
    const normalizedCode = normalizeAssetCode(asset.code)
    if (asset.market === 'A_SHARE' && !isAShareAssetCode(normalizedCode)) {
      throw new Error(`Only A-share 6-digit asset codes are supported: ${asset.code}`)
    }

    const db = getDatabase()
    const now = new Date().toISOString()
    const assetKey = buildAssetKey(asset.assetType, asset.market, normalizedCode)

    db.prepare(
      `
        INSERT INTO watchlist_items (asset_key, asset_type, market, code, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_key) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at
      `
    ).run(assetKey, asset.assetType, asset.market, normalizedCode, asset.name?.trim() || null, now, now)
  }

  async removeAsset(assetKey: AssetKey) {
    const normalized = assetKey.trim()
    if (!normalized) {
      return
    }

    const db = getDatabase()
    db.prepare('DELETE FROM watchlist_items WHERE asset_key = ?').run(normalized)
  }

  async addSymbol(symbol: string) {
    const normalized = normalizeSymbol(symbol)
    await this.addAsset({
      assetType: 'STOCK',
      market: 'A_SHARE',
      code: normalized
    })
  }

  async removeSymbol(symbol: string) {
    const normalized = normalizeSymbol(symbol)
    await this.removeAsset(buildStockAssetKey(normalized))
  }
}
