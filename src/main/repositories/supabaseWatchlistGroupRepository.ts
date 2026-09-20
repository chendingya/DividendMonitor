import type { AssetKey, WatchlistGroupDto, WatchlistGroupUpsertDto } from '@shared/contracts/api'
import { parseAssetKey } from '@shared/contracts/api'
import { getSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import { authService } from '@main/infrastructure/supabase/authService'
import { notifySyncStatus } from '@main/infrastructure/supabase/syncStatusNotifier'
import { WatchlistGroupRepository } from '@main/repositories/watchlistGroupRepository'
import type { IWatchlistGroupRepository, WatchlistAssetRecord } from '@main/repositories/interfaces'

export class SupabaseWatchlistGroupRepository implements IWatchlistGroupRepository {
  private readonly localRepo = new WatchlistGroupRepository()

  private async ensureLocalGroup(id: string): Promise<void> {
    if (!(await this.localRepo.listGroups()).some((group) => group.id === id)) {
      await this.listGroups()
    }
  }

  private async getUserId(): Promise<string> {
    const session = await authService.getSession()
    if (!session?.user.id) throw new Error('未登录，无法访问云端分组数据')
    return session.user.id
  }

  async listGroups(): Promise<WatchlistGroupDto[]> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.listGroups()

    try {
      const userId = await this.getUserId()
      const { data: groupsData, error: groupsError } = await supabase
        .from('watchlist_groups')
        .select('id, name, color, sort_order')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (groupsError) throw groupsError

      const { data: countsData, error: countsError } = await supabase
        .from('watchlist_group_assets')
        .select('group_id, asset_key')
        .eq('user_id', userId)

      if (countsError) throw countsError

      const { data: watchlistKeys, error: watchlistError } = await supabase
        .from('watchlist_items')
        .select('asset_key')
        .eq('user_id', userId)

      if (watchlistError) throw watchlistError

      const watchlistKeySet = new Set((watchlistKeys ?? []).map((r: Record<string, unknown>) => String(r['asset_key'])))

      const countMap = new Map<string, number>()
      for (const row of countsData ?? []) {
        const gid = String(row['group_id'])
        const akey = String(row['asset_key'])
        if (watchlistKeySet.has(akey)) {
          countMap.set(gid, (countMap.get(gid) ?? 0) + 1)
        }
      }

      const groups = (groupsData ?? []).map((row: Record<string, unknown>) => ({
        id: String(row['id']),
        name: String(row['name']),
        color: row['color'] ? String(row['color']) : undefined,
        sortOrder: Number(row['sort_order'] ?? 0),
        assetCount: countMap.get(String(row['id'])) ?? 0
      }))
      await this.localRepo.cacheGroups(groups, (countsData ?? []).map((row: Record<string, unknown>) => ({
        groupId: String(row['group_id']), assetKey: String(row['asset_key'])
      })))
      return groups
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '无法读取云端分组数据，使用本地缓存' })
      return this.localRepo.listGroups()
    }
  }

  private failWrite(error: unknown): never {
    const message = error instanceof Error ? error.message
      : typeof error === 'object' && error !== null && 'message' in error ? String(error.message)
      : String(error)
    notifySyncStatus({ status: 'error', message: `分组操作失败：${message}` })
    throw error instanceof Error ? error : new Error(message)
  }

  async createGroup(request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.createGroup(request)
    // Use-case validation runs before this boundary; generate identity without mutating the mirror.
    const group: WatchlistGroupDto = {
      id: globalThis.crypto.randomUUID(), name: request.name.trim(), color: request.color,
      sortOrder: request.sortOrder ?? 0, assetCount: 0
    }
    try {
      const userId = await this.getUserId()
      const now = new Date().toISOString()
      const { error } = await supabase.from('watchlist_groups').insert({
        id: group.id, user_id: userId, name: group.name, color: group.color ?? null,
        sort_order: group.sortOrder, created_at: now, updated_at: now
      })
      if (error) throw error
      await this.localRepo.cacheGroups([group], [])
      notifySyncStatus({ status: 'synced' })
      return group
    } catch (error) {
      return this.failWrite(error)
    }
  }

  async updateGroup(id: string, request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.updateGroup(id, request)
    try {
      const userId = await this.getUserId()
      const { error } = await supabase.from('watchlist_groups')
        .update({ name: request.name.trim(), color: request.color ?? null,
          ...(request.sortOrder === undefined ? {} : { sort_order: request.sortOrder }), updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId)
      if (error) throw error
      await this.ensureLocalGroup(id)
      const local = await this.localRepo.updateGroup(id, request)
      notifySyncStatus({ status: 'synced' })
      return local
    } catch (error) {
      return this.failWrite(error)
    }
  }

  async deleteGroup(id: string): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.deleteGroup(id)
    try {
      const userId = await this.getUserId()
      const { error } = await supabase.from('watchlist_groups').delete().eq('id', id).eq('user_id', userId)
      if (error) throw error
      await this.localRepo.deleteGroup(id)
      notifySyncStatus({ status: 'synced' })
    } catch (error) {
      this.failWrite(error)
    }
  }

  async addToGroup(groupId: string, assetKey: AssetKey): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.addToGroup(groupId, assetKey)
    try {
      const userId = await this.getUserId()
      const { error } = await supabase.from('watchlist_group_assets').upsert({
        group_id: groupId, user_id: userId, asset_key: assetKey.trim(), added_at: new Date().toISOString()
      }, { onConflict: 'group_id,asset_key' })
      if (error) throw error
      await this.ensureLocalGroup(groupId)
      await this.localRepo.addToGroup(groupId, assetKey)
      notifySyncStatus({ status: 'synced' })
    } catch (error) {
      this.failWrite(error)
    }
  }

  async removeFromGroup(groupId: string, assetKey: AssetKey): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.removeFromGroup(groupId, assetKey)
    try {
      const userId = await this.getUserId()
      const { error } = await supabase.from('watchlist_group_assets').delete()
        .eq('group_id', groupId).eq('user_id', userId).eq('asset_key', assetKey.trim())
      if (error) throw error
      await this.localRepo.removeFromGroup(groupId, assetKey)
      notifySyncStatus({ status: 'synced' })
    } catch (error) {
      this.failWrite(error)
    }
  }

  async listGroupAssets(groupId: string): Promise<WatchlistAssetRecord[]> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.listGroupAssets(groupId)

    try {
      const userId = await this.getUserId()
      const { data, error } = await supabase
        .from('watchlist_group_assets')
        .select('asset_key, added_at')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .order('added_at', { ascending: false })

      if (error) throw error

      const { data: watchlistKeys, error: watchlistError } = await supabase
        .from('watchlist_items')
        .select('asset_key, asset_type, market, code, name')
        .eq('user_id', userId)

      if (watchlistError) throw watchlistError

      const watchlistMap = new Map<string, { asset_type?: string; market?: string; code?: string; name?: string }>()
      for (const row of watchlistKeys ?? []) {
        const rec = row as Record<string, unknown>
        watchlistMap.set(String(rec['asset_key']), {
          asset_type: rec['asset_type'] != null ? String(rec['asset_type']) : undefined,
          market: rec['market'] != null ? String(rec['market']) : undefined,
          code: rec['code'] != null ? String(rec['code']) : undefined,
          name: rec['name'] != null ? String(rec['name']) : undefined
        })
      }

      return (data ?? [])
        .filter((row: Record<string, unknown>) => watchlistMap.has(String(row['asset_key'])))
        .map((row: Record<string, unknown>) => {
          const assetKey = String(row['asset_key'])
          const meta = watchlistMap.get(assetKey)
          const parsed = parseAssetKey(assetKey)
          return {
            assetKey,
            assetType: (meta?.asset_type ?? parsed?.assetType ?? 'STOCK') as WatchlistAssetRecord['assetType'],
            market: (meta?.market ?? parsed?.market ?? 'A_SHARE') as WatchlistAssetRecord['market'],
            code: meta?.code ?? parsed?.code ?? assetKey,
            name: meta?.name ?? undefined
          }
        })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '无法读取云端分组资产，使用本地缓存' })
      return this.localRepo.listGroupAssets(groupId)
    }
  }

  async getAssetGroupIds(assetKey: AssetKey): Promise<string[]> {
    // 在线读取以云端为准；网络不可用时使用上次成功保存的本地镜像。
    const localIds = await this.localRepo.getAssetGroupIds(assetKey)
    const supabase = getSupabaseClient()
    if (!supabase) return localIds

    try {
      const userId = await this.getUserId()
      const { data, error } = await supabase
        .from('watchlist_group_assets')
        .select('group_id')
        .eq('user_id', userId)
        .eq('asset_key', assetKey.trim())

      if (error) throw error

      const supabaseIds = (data ?? []).map((row: Record<string, unknown>) => String(row['group_id']))
      return Array.from(new Set(supabaseIds))
    } catch {
      return localIds
    }
  }
}
