import type { AssetIdentifierDto, AssetKey } from '@shared/contracts/api'
import { buildAssetKey, normalizeAssetCode } from '@shared/contracts/api'
import { getSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import { authService } from '@main/infrastructure/supabase/authService'
import { notifySyncStatus } from '@main/infrastructure/supabase/syncStatusNotifier'
import { WatchlistRepository } from '@main/repositories/watchlistRepository'
import type { IWatchlistRepository, WatchlistAssetRecord } from '@main/repositories/interfaces'

export class SupabaseWatchlistRepository implements IWatchlistRepository {
  private readonly localRepo = new WatchlistRepository()

  private async getUserId(): Promise<string> {
    const session = await authService.getSession()
    if (!session?.user.id) throw new Error('未登录，无法访问云端自选数据')
    return session.user.id
  }

  async listAssets(): Promise<WatchlistAssetRecord[]> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.listAssets()

    try {
      const userId = await this.getUserId()
      const { data, error } = await supabase
        .from('watchlist_items')
        .select('asset_key, asset_type, market, code, name')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((row: Record<string, unknown>) => ({
        assetKey: String(row['asset_key'] ?? ''),
        assetType: String(row['asset_type'] ?? 'STOCK') as WatchlistAssetRecord['assetType'],
        market: String(row['market'] ?? 'A_SHARE') as WatchlistAssetRecord['market'],
        code: normalizeAssetCode(String(row['code'] ?? '')),
        name: row['name'] ? String(row['name']) : undefined
      }))
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '无法读取云端自选数据，使用本地缓存' })
      return this.localRepo.listAssets()
    }
  }

  async listSymbols(): Promise<string[]> {
    const assets = await this.listAssets()
    return assets
      .filter((a) => a.assetType === 'STOCK' && a.market === 'A_SHARE')
      .map((a) => a.code)
  }

  async addAsset(asset: AssetIdentifierDto & { name?: string }): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.addAsset(asset)

    try {
      const userId = await this.getUserId()
      const normalizedCode = normalizeAssetCode(asset.code)
      const assetKey = buildAssetKey(asset.assetType, asset.market, normalizedCode)
      const now = new Date().toISOString()

      await supabase.from('watchlist_items').upsert({
        user_id: userId,
        asset_key: assetKey,
        asset_type: asset.assetType,
        market: asset.market,
        code: normalizedCode,
        name: asset.name?.trim() || null,
        updated_at: now
      }, { onConflict: 'user_id,asset_key' })

      notifySyncStatus({ status: 'synced' })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '同步失败，数据仅保存在本地' })
    }

    // Always write to local SQLite as cache
    await this.localRepo.addAsset(asset)
  }

  async removeAsset(assetKey: AssetKey): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.removeAsset(assetKey)

    try {
      const userId = await this.getUserId()
      await supabase.from('watchlist_items').delete().eq('user_id', userId).eq('asset_key', assetKey)
      notifySyncStatus({ status: 'synced' })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '云端删除失败' })
    }

    // Always remove from local
    await this.localRepo.removeAsset(assetKey)
  }

  async addSymbol(symbol: string): Promise<void> {
    const normalized = normalizeAssetCode(symbol)
    await this.addAsset({
      assetType: 'STOCK',
      market: 'A_SHARE',
      code: normalized
    })
  }

  async removeSymbol(symbol: string): Promise<void> {
    const normalized = normalizeAssetCode(symbol)
    await this.removeAsset(`STOCK:A_SHARE:${normalized}`)
  }
}
