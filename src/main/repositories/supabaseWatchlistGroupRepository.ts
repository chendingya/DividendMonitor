import type { AssetKey, WatchlistGroupDto, WatchlistGroupUpsertDto } from '@shared/contracts/api'
import { parseAssetKey } from '@shared/contracts/api'
import { getSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import { authService } from '@main/infrastructure/supabase/authService'
import { notifySyncStatus } from '@main/infrastructure/supabase/syncStatusNotifier'
import { WatchlistGroupRepository } from '@main/repositories/watchlistGroupRepository'
import type { IWatchlistGroupRepository, WatchlistAssetRecord } from '@main/repositories/interfaces'

export class SupabaseWatchlistGroupRepository implements IWatchlistGroupRepository {
  private readonly localRepo = new WatchlistGroupRepository()

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
        .select('group_id')
        .eq('user_id', userId)

      if (countsError) throw countsError

      const countMap = new Map<string, number>()
      for (const row of countsData ?? []) {
        const gid = String(row['group_id'])
        countMap.set(gid, (countMap.get(gid) ?? 0) + 1)
      }

      return (groupsData ?? []).map((row: Record<string, unknown>) => ({
        id: String(row['id']),
        name: String(row['name']),
        color: row['color'] ? String(row['color']) : undefined,
        sortOrder: Number(row['sort_order'] ?? 0),
        assetCount: countMap.get(String(row['id'])) ?? 0
      }))
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '无法读取云端分组数据，使用本地缓存' })
      return this.localRepo.listGroups()
    }
  }

  async createGroup(request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
    const local = await this.localRepo.createGroup(request)
    const supabase = getSupabaseClient()
    if (!supabase) return local

    try {
      const userId = await this.getUserId()
      const now = new Date().toISOString()

      await supabase.from('watchlist_groups').insert({
        id: local.id,
        user_id: userId,
        name: local.name,
        color: local.color ?? null,
        sort_order: local.sortOrder,
        created_at: now,
        updated_at: now
      })

      notifySyncStatus({ status: 'synced' })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '分组已保存在本地，云端同步失败' })
    }

    return local
  }

  async updateGroup(id: string, request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
    const local = await this.localRepo.updateGroup(id, request)
    const supabase = getSupabaseClient()
    if (!supabase) return local

    try {
      const userId = await this.getUserId()
      const now = new Date().toISOString()

      await supabase.from('watchlist_groups')
        .update({ name: local.name, color: local.color ?? null, sort_order: local.sortOrder, updated_at: now })
        .eq('id', id)
        .eq('user_id', userId)

      notifySyncStatus({ status: 'synced' })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '分组更新已保存在本地，云端同步失败' })
    }

    return local
  }

  async deleteGroup(id: string): Promise<void> {
    await this.localRepo.deleteGroup(id)
    const supabase = getSupabaseClient()
    if (!supabase) return

    try {
      const userId = await this.getUserId()
      await supabase.from('watchlist_groups').delete().eq('id', id).eq('user_id', userId)
      notifySyncStatus({ status: 'synced' })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '分组已从本地删除，云端同步失败' })
    }
  }

  async addToGroup(groupId: string, assetKey: AssetKey): Promise<void> {
    await this.localRepo.addToGroup(groupId, assetKey)
    const supabase = getSupabaseClient()
    if (!supabase) return

    try {
      const userId = await this.getUserId()
      const now = new Date().toISOString()

      await supabase.from('watchlist_group_assets').upsert({
        group_id: groupId,
        user_id: userId,
        asset_key: assetKey.trim(),
        added_at: now
      }, { onConflict: 'group_id,asset_key' })

      notifySyncStatus({ status: 'synced' })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '资产已加入本地分组，云端同步失败' })
    }
  }

  async removeFromGroup(groupId: string, assetKey: AssetKey): Promise<void> {
    await this.localRepo.removeFromGroup(groupId, assetKey)
    const supabase = getSupabaseClient()
    if (!supabase) return

    try {
      const userId = await this.getUserId()
      await supabase.from('watchlist_group_assets').delete()
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .eq('asset_key', assetKey.trim())
      notifySyncStatus({ status: 'synced' })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '资产已从本地分组移除，云端同步失败' })
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

      return (data ?? []).map((row: Record<string, unknown>) => {
        const assetKey = String(row['asset_key'])
        const parsed = parseAssetKey(assetKey)
        return {
          assetKey,
          assetType: (parsed?.assetType ?? 'STOCK') as WatchlistAssetRecord['assetType'],
          market: (parsed?.market ?? 'A_SHARE') as WatchlistAssetRecord['market'],
          code: parsed?.code ?? assetKey,
          name: undefined
        }
      })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '无法读取云端分组资产，使用本地缓存' })
      return this.localRepo.listGroupAssets(groupId)
    }
  }

  async getAssetGroupIds(assetKey: AssetKey): Promise<string[]> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.getAssetGroupIds(assetKey)

    try {
      const userId = await this.getUserId()
      const { data, error } = await supabase
        .from('watchlist_group_assets')
        .select('group_id')
        .eq('user_id', userId)
        .eq('asset_key', assetKey.trim())

      if (error) throw error

      return (data ?? []).map((row: Record<string, unknown>) => String(row['group_id']))
    } catch {
      return this.localRepo.getAssetGroupIds(assetKey)
    }
  }
}
