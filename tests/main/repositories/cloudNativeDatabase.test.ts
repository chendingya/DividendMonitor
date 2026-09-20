import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNodeSqliteDatabase } from '@main/infrastructure/db/nodeSqliteDatabase'
import { initializeSchema, resetDatabaseResolver, setDatabaseResolver } from '@main/infrastructure/db/sqlite'
import type { SqliteDatabase } from '@main/infrastructure/db/databaseTypes'

const cloud = vi.hoisted(() => ({ error: null as null | { message: string }, notifications: [] as Array<{ status: string; message?: string }>, available: true, memberships: [] as Array<{ group_id: string; asset_key: string }> }))
vi.mock('@main/infrastructure/supabase/authService', () => ({ authService: { getSession: async () => ({ user: { id: 'user-1' } }) } }))
vi.mock('@main/infrastructure/supabase/syncStatusNotifier', () => ({ notifySyncStatus: (status: { status: string }) => cloud.notifications.push(status) }))
vi.mock('@main/infrastructure/supabase/supabaseClient', () => ({
  getSupabaseClient: () => !cloud.available ? null : ({
    from(table: string) {
      let write = false
      const query = {
        select() { return query }, eq() { return query }, order() { return query },
        insert() { write = true; return query }, update() { write = true; return query },
        delete() { write = true; return query }, upsert() { write = true; return query },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(resolve({
            data: write ? null : table === 'watchlist_groups' ? [{ id: 'cloud-group', name: '云端分组', color: null, sort_order: 0 }] : table === 'watchlist_group_assets' ? cloud.memberships : [],
            error: write ? cloud.error : null
          }))
        }
      }
      return query
    }
  })
}))
import { WatchlistGroupRepository } from '@main/repositories/watchlistGroupRepository'
import { SupabaseWatchlistGroupRepository } from '@main/repositories/supabaseWatchlistGroupRepository'
import { SupabaseWatchlistRepository } from '@main/repositories/supabaseWatchlistRepository'
import { SupabasePortfolioRepository } from '@main/repositories/supabasePortfolioRepository'

let db: SqliteDatabase
beforeEach(async () => {
  db = createNodeSqliteDatabase(new DatabaseSync(':memory:'))
  await initializeSchema(db)
  await db.exec('PRAGMA foreign_keys = ON')
  setDatabaseResolver(() => db)
  cloud.error = null
  cloud.available = true
  cloud.memberships = []
  cloud.notifications.length = 0
})
afterEach(async () => { await db.close(); resetDatabaseResolver() })

describe('cloud repositories on an empty native database', () => {
  it('materializes cloud groups so their first edit and membership write succeed locally', async () => {
    const repo = new SupabaseWatchlistGroupRepository()
    expect(await repo.listGroups()).toHaveLength(1)
    expect(await repo.updateGroup('cloud-group', { name: '已编辑' })).toMatchObject({ name: '已编辑' })
    await repo.addToGroup('cloud-group', 'STOCK:A_SHARE:600519')
    expect(await db.prepare('SELECT asset_key FROM watchlist_group_assets').all()).toEqual([{ asset_key: 'STOCK:A_SHARE:600519' }])
  })

  it('replaces the cached member snapshot when another device removes a member', async () => {
    const repo = new WatchlistGroupRepository()
    const groups = [{ id: 'cloud-group', name: '云端分组', sortOrder: 0, assetCount: 1 }]
    await repo.cacheGroups(groups, [{ groupId: 'cloud-group', assetKey: 'STOCK:A_SHARE:600519' }])
    expect(await repo.getAssetGroupIds('STOCK:A_SHARE:600519')).toEqual(['cloud-group'])
    await repo.cacheGroups(groups, [])
    expect(await repo.getAssetGroupIds('STOCK:A_SHARE:600519')).toEqual([])
  })

  it.each(['create', 'update', 'delete', 'add', 'remove'] as const)('rejects failed online %s without changing the local mirror before or after reload', async (operation) => {
    const repo = new SupabaseWatchlistGroupRepository()
    cloud.memberships = [{ group_id: 'cloud-group', asset_key: 'STOCK:A_SHARE:600519' }]
    await repo.listGroups()
    const snapshot = async () => ({
      groups: await db.prepare('SELECT * FROM watchlist_groups ORDER BY id').all(),
      members: await db.prepare('SELECT group_id, asset_key FROM watchlist_group_assets ORDER BY asset_key').all()
    })
    const before = await snapshot()
    cloud.error = { message: 'permission denied' }
    const mutation = () => {
      switch (operation) {
        case 'create': return repo.createGroup({ name: '失败新组' })
        case 'update': return repo.updateGroup('cloud-group', { name: '失败改名' })
        case 'delete': return repo.deleteGroup('cloud-group')
        case 'add': return repo.addToGroup('cloud-group', 'STOCK:A_SHARE:601988')
        case 'remove': return repo.removeFromGroup('cloud-group', 'STOCK:A_SHARE:600519')
      }
    }
    await expect(mutation()).rejects.toMatchObject({ message: 'permission denied' })
    expect(await snapshot()).toEqual(before)
    expect(cloud.notifications.some((event) => event.status === 'synced' || event.message?.includes('已保存在本地'))).toBe(false)
    await repo.listGroups()
    const afterReload = await snapshot()
    expect(afterReload.groups.map(({ id, name }) => ({ id, name }))).toEqual(before.groups.map(({ id, name }) => ({ id, name })))
    expect(afterReload.members).toEqual(before.members)
  })

  it('keeps every group mutation local when Supabase is unavailable', async () => {
    cloud.available = false
    const repo = new SupabaseWatchlistGroupRepository()
    const group = await repo.createGroup({ name: '离线组' })
    await repo.updateGroup(group.id, { name: '离线改名' })
    await repo.addToGroup(group.id, 'STOCK:A_SHARE:600519')
    expect(await repo.getAssetGroupIds('STOCK:A_SHARE:600519')).toEqual([group.id])
    await repo.removeFromGroup(group.id, 'STOCK:A_SHARE:600519')
    expect(await repo.getAssetGroupIds('STOCK:A_SHARE:600519')).toEqual([])
    await repo.deleteGroup(group.id)
    expect(await repo.listGroups()).toEqual([])
  })

  it.each(['group', 'watchlist', 'portfolio'] as const)('reports %s cloud write errors instead of synced', async (kind) => {
    cloud.error = { message: 'permission denied' }
    if (kind === 'group') await expect(new SupabaseWatchlistGroupRepository().createGroup({ name: '新组' })).rejects.toMatchObject({ message: 'permission denied' })
    if (kind === 'watchlist') await new SupabaseWatchlistRepository().addAsset({ assetType: 'STOCK', market: 'A_SHARE', code: '600519' })
    if (kind === 'portfolio') await new SupabasePortfolioRepository().remove('missing')
    expect(cloud.notifications.some((event) => event.status === 'synced')).toBe(false)
    expect(cloud.notifications.some((event) => event.status === (kind === 'group' ? 'error' : 'offline-fallback'))).toBe(true)
  })
})
