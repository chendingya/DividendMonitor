import { getDatabase } from '@main/infrastructure/db/sqlite'
import type { AssetType } from '@shared/contracts/api'
import { isSnapshotFresh } from '@main/infrastructure/config/assetCacheConfig'

export type AssetSnapshotRow = {
  assetKey: string
  assetType: string
  dataJson: string
  fetchedAt: string
}

export class AssetSnapshotRepository {
  upsert(assetKey: string, assetType: string, dataJson: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT OR REPLACE INTO asset_snapshots (asset_key, asset_type, data_json, fetched_at)
       VALUES (?, ?, ?, ?)`
    ).run(assetKey, assetType, dataJson, now)
  }

  findByKey(assetKey: string): AssetSnapshotRow | undefined {
    const db = getDatabase()
    const row = db
      .prepare('SELECT asset_key, asset_type, data_json, fetched_at FROM asset_snapshots WHERE asset_key = ?')
      .get(assetKey) as Record<string, string> | undefined
    if (!row) return undefined
    return {
      assetKey: row.asset_key,
      assetType: row.asset_type,
      dataJson: row.data_json,
      fetchedAt: row.fetched_at
    }
  }

  findFreshByKey<T>(assetKey: string, assetType: AssetType): T | undefined {
    try {
      const row = this.findByKey(assetKey)
      if (!row) return undefined
      if (!isSnapshotFresh(row.fetchedAt, assetType)) return undefined
      return JSON.parse(row.dataJson) as T
    } catch {
      return undefined
    }
  }

  findByKeys(assetKeys: string[]): Map<string, AssetSnapshotRow> {
    if (assetKeys.length === 0) return new Map()
    const db = getDatabase()
    const placeholders = assetKeys.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT asset_key, asset_type, data_json, fetched_at
         FROM asset_snapshots WHERE asset_key IN (${placeholders})`
      )
      .all(...assetKeys) as Array<Record<string, string>>

    const result = new Map<string, AssetSnapshotRow>()
    for (const row of rows) {
      result.set(row.asset_key, {
        assetKey: row.asset_key,
        assetType: row.asset_type,
        dataJson: row.data_json,
        fetchedAt: row.fetched_at
      })
    }
    return result
  }

  remove(assetKey: string): void {
    const db = getDatabase()
    db.prepare('DELETE FROM asset_snapshots WHERE asset_key = ?').run(assetKey)
  }

  removeOlderThan(olderThanIso: string): void {
    const db = getDatabase()
    db.prepare('DELETE FROM asset_snapshots WHERE fetched_at < ?').run(olderThanIso)
  }
}
