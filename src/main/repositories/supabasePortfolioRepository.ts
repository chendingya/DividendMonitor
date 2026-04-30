import type { AssetQueryDto, PortfolioPositionDto, PortfolioPositionReplaceByAssetDto, PortfolioPositionUpsertDto } from '@shared/contracts/api'
import { buildAssetKey, normalizeAssetCode, resolveAssetQuery } from '@shared/contracts/api'
import { getSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import { authService } from '@main/infrastructure/supabase/authService'
import { notifySyncStatus } from '@main/infrastructure/supabase/syncStatusNotifier'
import { PortfolioRepository } from '@main/repositories/portfolioRepository'
import type { IPortfolioRepository } from '@main/repositories/interfaces'

export class SupabasePortfolioRepository implements IPortfolioRepository {
  private readonly localRepo = new PortfolioRepository()

  private async getUserId(): Promise<string> {
    const session = await authService.getSession()
    if (!session?.user.id) throw new Error('未登录，无法访问云端持仓数据')
    return session.user.id
  }

  async list(): Promise<PortfolioPositionDto[]> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.list()

    try {
      const userId = await this.getUserId()
      const { data, error } = await supabase
        .from('portfolio_positions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row['id'] ?? ''),
        assetKey: String(row['asset_key'] ?? ''),
        assetType: String(row['asset_type'] ?? 'STOCK') as PortfolioPositionDto['assetType'],
        market: String(row['market'] ?? 'A_SHARE') as PortfolioPositionDto['market'],
        code: String(row['code'] ?? ''),
        symbol: String(row['asset_type'] ?? '') === 'STOCK' ? String(row['code'] ?? '') : undefined,
        name: String(row['name'] ?? ''),
        direction: String(row['direction'] ?? 'BUY') as PortfolioPositionDto['direction'],
        shares: Number(row['shares'] ?? 0),
        avgCost: Number(row['avg_cost'] ?? 0),
        createdAt: String(row['created_at'] ?? ''),
        updatedAt: String(row['updated_at'] ?? '')
      }))
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '无法读取云端持仓数据，使用本地缓存' })
      return this.localRepo.list()
    }
  }

  async upsert(request: PortfolioPositionUpsertDto): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.upsert(request)

    const code = normalizeAssetCode(request.code ?? request.symbol ?? '')
    const assetType = request.assetType ?? (request.symbol ? 'STOCK' : undefined)
    const market = request.market ?? (request.symbol ? 'A_SHARE' : undefined)
    if (!assetType || !market || !code) return this.localRepo.upsert(request)

    const name = request.name.trim()
    if (!name) {
      console.warn('[SupabasePortfolioRepository] upsert skipped cloud sync — empty name, stored locally only')
      return this.localRepo.upsert(request)
    }

    const shares = Number(request.shares)
    const avgCost = Number(request.avgCost)
    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
      console.warn('[SupabasePortfolioRepository] upsert skipped cloud sync — invalid shares/avgCost, stored locally only')
      return this.localRepo.upsert(request)
    }

    const now = new Date().toISOString()
    const id = request.id?.trim() || `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const assetKey = request.assetKey?.trim() || buildAssetKey(assetType, market, code)
    const direction = request.direction === 'SELL' ? 'SELL' : 'BUY'

    try {
      const userId = await this.getUserId()

      // Check if position already exists for this user+asset to decide upsert strategy
      const { data: existing } = await supabase
        .from('portfolio_positions')
        .select('id')
        .eq('user_id', userId)
        .eq('asset_key', assetKey)
        .limit(1)

      if (existing && existing.length > 0 && !request.id) {
        // Update existing position by asset_key
        await supabase
          .from('portfolio_positions')
          .update({
            asset_type: assetType,
            market,
            code,
            name,
            direction,
            shares,
            avg_cost: avgCost,
            updated_at: now
          })
          .eq('user_id', userId)
          .eq('asset_key', assetKey)
      } else {
        // Insert new or update by id
        await supabase.from('portfolio_positions').upsert({
          id,
          user_id: userId,
          asset_key: assetKey,
          asset_type: assetType,
          market,
          code,
          name,
          direction,
          shares,
          avg_cost: avgCost,
          created_at: now,
          updated_at: now
        }, { onConflict: 'id' })
      }

      notifySyncStatus({ status: 'synced' })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '持仓同步失败，数据仅保存在本地' })
    }

    await this.localRepo.upsert(request)
  }

  async remove(id: string): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.remove(id)

    try {
      const userId = await this.getUserId()
      await supabase.from('portfolio_positions').delete().eq('user_id', userId).eq('id', id)
      notifySyncStatus({ status: 'synced' })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '云端持仓删除失败' })
    }

    await this.localRepo.remove(id)
  }

  async removeByAsset(request: AssetQueryDto): Promise<void> {
    const supabase = getSupabaseClient()
    const identity = resolveAssetQuery(request)
    const assetKey = buildAssetKey(identity.assetType, identity.market, identity.code)

    if (supabase) {
      try {
        const userId = await this.getUserId()
        await supabase.from('portfolio_positions').delete().eq('user_id', userId).eq('asset_key', assetKey)
        notifySyncStatus({ status: 'synced' })
      } catch {
        notifySyncStatus({ status: 'offline-fallback', message: '云端持仓删除失败' })
      }
    }

    await this.localRepo.removeByAsset(request)
  }

  async replaceByAsset(request: PortfolioPositionReplaceByAssetDto): Promise<void> {
    const supabase = getSupabaseClient()
    if (!supabase) return this.localRepo.replaceByAsset(request)

    const identity = resolveAssetQuery(request.asset)
    const name = request.name.trim()
    const shares = Number(request.shares)
    const avgCost = Number(request.avgCost)
    if (!name) {
      console.warn('[SupabasePortfolioRepository] replaceByAsset skipped cloud sync — empty name, stored locally only')
      return this.localRepo.replaceByAsset(request)
    }
    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
      console.warn('[SupabasePortfolioRepository] replaceByAsset skipped cloud sync — invalid shares/avgCost, stored locally only')
      return this.localRepo.replaceByAsset(request)
    }

    const assetKey = buildAssetKey(identity.assetType, identity.market, identity.code)
    const now = new Date().toISOString()
    const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    try {
      const userId = await this.getUserId()
      // Delete then insert to ensure consistency
      await supabase.from('portfolio_positions').delete().eq('user_id', userId).eq('asset_key', assetKey)
      await supabase.from('portfolio_positions').insert({
        id,
        user_id: userId,
        asset_key: assetKey,
        asset_type: identity.assetType,
        market: identity.market,
        code: identity.code,
        name,
        direction: 'BUY',
        shares,
        avg_cost: avgCost,
        created_at: now,
        updated_at: now
      })
      notifySyncStatus({ status: 'synced' })
    } catch {
      notifySyncStatus({ status: 'offline-fallback', message: '持仓同步失败，数据仅保存在本地' })
    }

    await this.localRepo.replaceByAsset(request)
  }
}
