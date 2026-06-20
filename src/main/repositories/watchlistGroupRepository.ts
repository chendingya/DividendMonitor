import { randomUUID } from 'node:crypto'
import { getDatabase } from '@main/infrastructure/db/sqlite'
import type { AssetKey, WatchlistGroupDto, WatchlistGroupUpsertDto } from '@shared/contracts/api'
import type { IWatchlistGroupRepository, WatchlistAssetRecord } from '@main/repositories/interfaces'

export class WatchlistGroupRepository implements IWatchlistGroupRepository {
  async listGroups(): Promise<WatchlistGroupDto[]> {
    const db = getDatabase()
    const groups = db
      .prepare(
        `SELECT g.id, g.name, g.color, g.sort_order, g.created_at, g.updated_at,
                COUNT(ga.asset_key) AS asset_count
         FROM watchlist_groups g
         LEFT JOIN watchlist_group_assets ga ON g.id = ga.group_id
         GROUP BY g.id
         ORDER BY g.sort_order ASC, g.name ASC`
      )
      .all() as Array<{
      id: string
      name: string
      color: string | null
      sort_order: number
      created_at: string
      updated_at: string
      asset_count: number
    }>

    return groups.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color ?? undefined,
      sortOrder: row.sort_order,
      assetCount: row.asset_count
    }))
  }

  async createGroup(request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
    const db = getDatabase()
    const id = randomUUID()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO watchlist_groups (id, name, color, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, request.name.trim(), request.color || null, request.sortOrder ?? 0, now, now)

    return { id, name: request.name.trim(), color: request.color, sortOrder: request.sortOrder ?? 0, assetCount: 0 }
  }

  async updateGroup(id: string, request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
    const db = getDatabase()
    const now = new Date().toISOString()

    const info = db.prepare(
      `UPDATE watchlist_groups
       SET name = COALESCE(?, name),
           color = ?,
           sort_order = COALESCE(?, sort_order),
           updated_at = ?
       WHERE id = ?`
    ).run(request.name.trim(), request.color ?? null, request.sortOrder ?? null, now, id)

    if (info.changes === 0) {
      throw new Error(`分组不存在: ${id}`)
    }

    const row = db.prepare(
      `SELECT g.id, g.name, g.color, g.sort_order,
              COUNT(ga.asset_key) AS asset_count
       FROM watchlist_groups g
       LEFT JOIN watchlist_group_assets ga ON g.id = ga.group_id
       WHERE g.id = ?
       GROUP BY g.id`
    ).get(id) as {
      id: string
      name: string
      color: string | null
      sort_order: number
      asset_count: number
    } | undefined

    if (!row) {
      throw new Error(`分组不存在: ${id}`)
    }

    return { id: row.id, name: row.name, color: row.color ?? undefined, sortOrder: row.sort_order, assetCount: row.asset_count }
  }

  async deleteGroup(id: string): Promise<void> {
    const db = getDatabase()
    db.prepare('DELETE FROM watchlist_groups WHERE id = ?').run(id)
  }

  async addToGroup(groupId: string, assetKey: AssetKey): Promise<void> {
    const db = getDatabase()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT OR IGNORE INTO watchlist_group_assets (group_id, asset_key, added_at)
       VALUES (?, ?, ?)`
    ).run(groupId, assetKey.trim(), now)
  }

  async removeFromGroup(groupId: string, assetKey: AssetKey): Promise<void> {
    const db = getDatabase()
    db.prepare(
      'DELETE FROM watchlist_group_assets WHERE group_id = ? AND asset_key = ?'
    ).run(groupId, assetKey.trim())
  }

  async listGroupAssets(groupId: string): Promise<WatchlistAssetRecord[]> {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT wi.asset_key, wi.asset_type, wi.market, wi.code, wi.name
         FROM watchlist_group_assets ga
         JOIN watchlist_items wi ON ga.asset_key = wi.asset_key
         WHERE ga.group_id = ?
         ORDER BY ga.added_at DESC`
      )
      .all(groupId) as Array<{
      asset_key: string
      asset_type: string
      market: string
      code: string
      name: string | null
    }>

    return rows.map((row) => ({
      assetKey: row.asset_key,
      assetType: row.asset_type as WatchlistAssetRecord['assetType'],
      market: row.market as WatchlistAssetRecord['market'],
      code: row.code,
      name: row.name ?? undefined
    }))
  }

  async getAssetGroupIds(assetKey: AssetKey): Promise<string[]> {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT group_id FROM watchlist_group_assets WHERE asset_key = ?')
      .all(assetKey.trim()) as Array<{ group_id: string }>

    return rows.map((row) => row.group_id)
  }
}
