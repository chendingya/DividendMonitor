import { getSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import { authService } from '@main/infrastructure/supabase/authService'
import { notifySyncStatus } from '@main/infrastructure/supabase/syncStatusNotifier'
import { getDatabase } from '@main/infrastructure/db/sqlite'
import { WatchlistRepository } from '@main/repositories/watchlistRepository'
import { PortfolioRepository } from '@main/repositories/portfolioRepository'
import { buildAssetKey, normalizeAssetCode } from '@shared/contracts/api'

export type SyncDirection = 'push' | 'pull' | 'bidirectional'

export type SyncResult = {
  direction: SyncDirection
  watchlistPushed: number
  watchlistPulled: number
  portfolioPushed: number
  portfolioPulled: number
  errors: string[]
}

async function getUserId(): Promise<string> {
  const session = await authService.getSession()
  if (!session?.user.id) throw new Error('未登录，无法同步')
  return session.user.id
}

// ─── Push: local → cloud (batch upsert strategy) ────────────────────────────

/**
 * Push local SQLite data to Supabase (batch upsert strategy).
 * Upserts all local records in bulk, then deletes cloud records not present
 * locally in a single batch call. This avoids N+1 API calls.
 */
async function pushLocalToCloud(): Promise<{ watchlist: number; portfolio: number; errors: string[] }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase 未配置')

  const userId = await getUserId()
  const errors: string[] = []
  let watchlistCount = 0
  let portfolioCount = 0

  const localWatchlist = new WatchlistRepository()
  const localPortfolio = new PortfolioRepository()

  // Push watchlist: batch upsert all items, then batch delete cloud-only
  try {
    const assets = await localWatchlist.listAssets()
    const now = new Date().toISOString()
    const localKeys = new Set<string>()

    const upsertRows = assets.map((asset) => {
      const assetKey = buildAssetKey(asset.assetType, asset.market, normalizeAssetCode(asset.code))
      localKeys.add(assetKey)
      return {
        user_id: userId,
        asset_key: assetKey,
        asset_type: asset.assetType,
        market: asset.market,
        code: normalizeAssetCode(asset.code),
        name: asset.name?.trim() || null,
        updated_at: now
      }
    })

    if (upsertRows.length > 0) {
      const { error } = await supabase.from('watchlist_items').upsert(upsertRows, { onConflict: 'user_id,asset_key' })
      if (error) {
        errors.push(`自选批量推送失败: ${error.message}`)
      } else {
        watchlistCount = upsertRows.length
      }
    }

    // Batch delete cloud items not present in local
    const { data: cloudItems, error: selectError } = await supabase
      .from('watchlist_items')
      .select('asset_key')
      .eq('user_id', userId)

    if (selectError) {
      errors.push(`自选云端查询失败: ${selectError.message}`)
    } else {
      const keysToDelete = (cloudItems ?? [])
        .map((row: { asset_key: string }) => row.asset_key)
        .filter((key: string) => !localKeys.has(key))

      if (keysToDelete.length > 0) {
        const { error } = await supabase
          .from('watchlist_items')
          .delete()
          .eq('user_id', userId)
          .in('asset_key', keysToDelete)
        if (error) {
          errors.push(`自选云端批量删除失败: ${error.message}`)
        }
      }
    }
  } catch (err) {
    errors.push(`自选推送异常: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Push portfolio: batch upsert all items, then batch delete cloud-only
  try {
    const positions = await localPortfolio.list()
    const now = new Date().toISOString()
    const localIds = new Set<string>()

    const upsertRows = positions.map((pos) => {
      const code = normalizeAssetCode(pos.code ?? pos.symbol ?? '')
      const assetKey = pos.assetKey?.trim() || buildAssetKey(pos.assetType, pos.market, code)
      localIds.add(pos.id)
      return {
        id: pos.id,
        user_id: userId,
        asset_key: assetKey,
        asset_type: pos.assetType,
        market: pos.market,
        code,
        name: pos.name,
        direction: pos.direction ?? 'BUY',
        shares: pos.shares,
        avg_cost: pos.avgCost,
        created_at: pos.createdAt || now,
        updated_at: now
      }
    })

    if (upsertRows.length > 0) {
      const { error } = await supabase.from('portfolio_positions').upsert(upsertRows, { onConflict: 'id' })
      if (error) {
        errors.push(`持仓批量推送失败: ${error.message}`)
      } else {
        portfolioCount = upsertRows.length
      }
    }

    // Batch delete cloud items not present in local
    const { data: cloudItems, error: selectError } = await supabase
      .from('portfolio_positions')
      .select('id')
      .eq('user_id', userId)

    if (selectError) {
      errors.push(`持仓云端查询失败: ${selectError.message}`)
    } else {
      const idsToDelete = (cloudItems ?? [])
        .map((row: { id: string }) => row.id)
        .filter((id: string) => !localIds.has(id))

      if (idsToDelete.length > 0) {
        const { error } = await supabase
          .from('portfolio_positions')
          .delete()
          .in('id', idsToDelete)
        if (error) {
          errors.push(`持仓云端批量删除失败: ${error.message}`)
        }
      }
    }
  } catch (err) {
    errors.push(`持仓推送异常: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { watchlist: watchlistCount, portfolio: portfolioCount, errors }
}

// ─── Pull: cloud → local (transaction-safe strategy) ────────────────────────

/**
 * Pull Supabase data to local SQLite (transaction-safe strategy).
 * Cloud data is fetched to memory first, then local data is replaced
 * within a single SQLite transaction — if any step fails, everything rolls back.
 */
async function pullCloudToLocal(): Promise<{ watchlist: number; portfolio: number; errors: string[] }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase 未配置')

  const userId = await getUserId()
  const errors: string[] = []
  let watchlistCount = 0
  let portfolioCount = 0

  // Pull watchlist: fetch cloud data first, then replace local in a transaction
  try {
    const { data, error } = await supabase
      .from('watchlist_items')
      .select('asset_key, asset_type, market, code, name')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) {
      errors.push(`自选拉取失败: ${error.message}`)
    } else {
      const cloudRows = data ?? []
      const localWatchlist = new WatchlistRepository()

      const db = getDatabase()
      db.exec('BEGIN')
      try {
        const localAssets = await localWatchlist.listAssets()
        for (const asset of localAssets) {
          const assetKey = buildAssetKey(asset.assetType, asset.market, normalizeAssetCode(asset.code))
          await localWatchlist.removeAsset(assetKey)
        }
        for (const row of cloudRows) {
          await localWatchlist.addAsset({
            assetType: String(row['asset_type'] ?? 'STOCK') as 'STOCK' | 'ETF' | 'FUND',
            market: String(row['market'] ?? 'A_SHARE') as 'A_SHARE',
            code: normalizeAssetCode(String(row['code'] ?? '')),
            name: row['name'] ? String(row['name']) : undefined
          })
          watchlistCount++
        }
        db.exec('COMMIT')
      } catch (innerErr) {
        db.exec('ROLLBACK')
        throw innerErr
      }
    }
  } catch (err) {
    errors.push(`自选拉取异常: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Pull portfolio: fetch cloud data first, then replace local in a transaction
  try {
    const { data, error } = await supabase
      .from('portfolio_positions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) {
      errors.push(`持仓拉取失败: ${error.message}`)
    } else {
      const cloudRows = data ?? []
      const localPortfolio = new PortfolioRepository()

      const db = getDatabase()
      db.exec('BEGIN')
      try {
        const localPositions = await localPortfolio.list()
        for (const pos of localPositions) {
          await localPortfolio.remove(pos.id)
        }
        for (const row of cloudRows) {
          await localPortfolio.upsert({
            id: String(row['id'] ?? ''),
            assetKey: String(row['asset_key'] ?? ''),
            assetType: String(row['asset_type'] ?? 'STOCK') as 'STOCK' | 'ETF' | 'FUND',
            market: String(row['market'] ?? 'A_SHARE') as 'A_SHARE',
            code: String(row['code'] ?? ''),
            symbol: String(row['asset_type'] ?? '') === 'STOCK' ? String(row['code'] ?? '') : undefined,
            name: String(row['name'] ?? ''),
            direction: String(row['direction'] ?? 'BUY') as 'BUY' | 'SELL',
            shares: Number(row['shares'] ?? 0),
            avgCost: Number(row['avg_cost'] ?? 0)
          })
          portfolioCount++
        }
        db.exec('COMMIT')
      } catch (innerErr) {
        db.exec('ROLLBACK')
        throw innerErr
      }
    }
  } catch (err) {
    errors.push(`持仓拉取异常: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { watchlist: watchlistCount, portfolio: portfolioCount, errors }
}

// ─── Bidirectional: merge both sides ────────────────────────────────────────

type WatchlistRow = {
  assetKey: string
  assetType: string
  market: string
  code: string
  name: string | null
}

type PortfolioRow = {
  id: string
  assetKey: string
  assetType: string
  market: string
  code: string
  name: string | null
  direction: string
  shares: number
  avgCost: number
  createdAt: string
  updatedAt: string
}

/**
 * Bidirectional merge: reads both local and cloud, unions them by key,
 * then writes the merged result to both sides using batch operations.
 *
 * - Watchlist: union by asset_key (no duplicates)
 * - Portfolio: union by id; if same id on both sides, keep the newer one (by updatedAt)
 */
async function bidirectionalMerge(): Promise<{ watchlistPushed: number; watchlistPulled: number; portfolioPushed: number; portfolioPulled: number; errors: string[] }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase 未配置')

  const userId = await getUserId()
  const errors: string[] = []
  let watchlistPushed = 0
  let watchlistPulled = 0
  let portfolioPushed = 0
  let portfolioPulled = 0

  const localWatchlist = new WatchlistRepository()
  const localPortfolio = new PortfolioRepository()

  // ── Watchlist merge ──
  try {
    // Read local
    const localAssets = await localWatchlist.listAssets()
    const localWlMap = new Map<string, WatchlistRow>()
    for (const a of localAssets) {
      const key = buildAssetKey(a.assetType, a.market, normalizeAssetCode(a.code))
      localWlMap.set(key, {
        assetKey: key,
        assetType: a.assetType,
        market: a.market,
        code: normalizeAssetCode(a.code),
        name: a.name?.trim() || null
      })
    }

    // Read cloud
    const { data: cloudWlData, error: wlSelectError } = await supabase
      .from('watchlist_items')
      .select('asset_key, asset_type, market, code, name, updated_at')
      .eq('user_id', userId)

    if (wlSelectError) {
      errors.push(`自选云端读取失败: ${wlSelectError.message}`)
    } else {
      const cloudWlMap = new Map<string, WatchlistRow & { updatedAt: string }>()
      for (const row of (cloudWlData ?? [])) {
        const key = String(row['asset_key'])
        cloudWlMap.set(key, {
          assetKey: key,
          assetType: String(row['asset_type'] ?? 'STOCK'),
          market: String(row['market'] ?? 'A_SHARE'),
          code: normalizeAssetCode(String(row['code'] ?? '')),
          name: row['name'] ? String(row['name']) : null,
          updatedAt: String(row['updated_at'] ?? '')
        })
      }

      // Push local-only items to cloud in batch
      const onlyInLocal = [...localWlMap.keys()].filter(k => !cloudWlMap.has(k))
      if (onlyInLocal.length > 0) {
        const now = new Date().toISOString()
        const upsertRows = onlyInLocal.map((key) => {
          const item = localWlMap.get(key)!
          return {
            user_id: userId,
            asset_key: key,
            asset_type: item.assetType,
            market: item.market,
            code: item.code,
            name: item.name,
            updated_at: now
          }
        })
        const { error } = await supabase.from('watchlist_items').upsert(upsertRows, { onConflict: 'user_id,asset_key' })
        if (error) {
          errors.push(`自选批量推送失败: ${error.message}`)
        } else {
          watchlistPushed = upsertRows.length
        }
      }

      // Pull cloud-only items to local
      const onlyInCloud = [...cloudWlMap.keys()].filter(k => !localWlMap.has(k))
      for (const key of onlyInCloud) {
        const item = cloudWlMap.get(key)!
        await localWatchlist.addAsset({
          assetType: item.assetType as 'STOCK' | 'ETF' | 'FUND',
          market: item.market as 'A_SHARE',
          code: item.code,
          name: item.name ?? undefined
        })
        watchlistPulled++
      }
    }
  } catch (err) {
    errors.push(`自选双向同步异常: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Portfolio merge ──
  try {
    // Read local
    const localPositions = await localPortfolio.list()
    const localPfMap = new Map<string, PortfolioRow>()
    for (const pos of localPositions) {
      const code = normalizeAssetCode(pos.code ?? pos.symbol ?? '')
      const assetKey = pos.assetKey?.trim() || buildAssetKey(pos.assetType, pos.market, code)
      localPfMap.set(pos.id, {
        id: pos.id,
        assetKey,
        assetType: pos.assetType,
        market: pos.market,
        code,
        name: pos.name ?? null,
        direction: pos.direction ?? 'BUY',
        shares: pos.shares,
        avgCost: pos.avgCost,
        createdAt: pos.createdAt || new Date().toISOString(),
        updatedAt: pos.updatedAt || new Date().toISOString()
      })
    }

    // Read cloud
    const { data: cloudPfData, error: pfSelectError } = await supabase
      .from('portfolio_positions')
      .select('*')
      .eq('user_id', userId)

    if (pfSelectError) {
      errors.push(`持仓云端读取失败: ${pfSelectError.message}`)
    } else {
      const cloudPfMap = new Map<string, PortfolioRow>()
      for (const row of (cloudPfData ?? [])) {
        const id = String(row['id'])
        cloudPfMap.set(id, {
          id,
          assetKey: String(row['asset_key'] ?? ''),
          assetType: String(row['asset_type'] ?? 'STOCK'),
          market: String(row['market'] ?? 'A_SHARE'),
          code: String(row['code'] ?? ''),
          name: row['name'] ? String(row['name']) : null,
          direction: String(row['direction'] ?? 'BUY'),
          shares: Number(row['shares'] ?? 0),
          avgCost: Number(row['avg_cost'] ?? 0),
          createdAt: String(row['created_at'] ?? ''),
          updatedAt: String(row['updated_at'] ?? '')
        })
      }

      // Batch push local-only items to cloud
      const now = new Date().toISOString()
      const onlyInLocal = [...localPfMap.entries()].filter(([id]) => !cloudPfMap.has(id))
      if (onlyInLocal.length > 0) {
        const upsertRows = onlyInLocal.map(([, item]) => ({
          id: item.id,
          user_id: userId,
          asset_key: item.assetKey,
          asset_type: item.assetType,
          market: item.market,
          code: item.code,
          name: item.name,
          direction: item.direction,
          shares: item.shares,
          avg_cost: item.avgCost,
          created_at: item.createdAt || now,
          updated_at: now
        }))
        const { error } = await supabase.from('portfolio_positions').upsert(upsertRows, { onConflict: 'id' })
        if (error) {
          errors.push(`持仓批量推送失败: ${error.message}`)
        } else {
          portfolioPushed = upsertRows.length
        }
      }

      // Pull cloud-only items to local
      const onlyInCloud = [...cloudPfMap.entries()].filter(([id]) => !localPfMap.has(id))
      for (const [, item] of onlyInCloud) {
        await localPortfolio.upsert({
          id: item.id,
          assetKey: item.assetKey,
          assetType: item.assetType as 'STOCK' | 'ETF' | 'FUND',
          market: item.market as 'A_SHARE',
          code: item.code,
          symbol: item.assetType === 'STOCK' ? item.code : undefined,
          name: item.name ?? '',
          direction: item.direction as 'BUY' | 'SELL',
          shares: item.shares,
          avgCost: item.avgCost
        })
        portfolioPulled++
      }

      // For same-id items on both sides, keep the one with newer updatedAt
      // Batch collect updates for efficiency
      const updatesToCloud: Array<{ id: string; data: Record<string, unknown> }> = []
      const bothSides = [...localPfMap.entries()].filter(([id]) => cloudPfMap.has(id))
      for (const [id, localItem] of bothSides) {
        const cloudItem = cloudPfMap.get(id)!
        const localTime = new Date(localItem.updatedAt).getTime() || 0
        const cloudTime = new Date(cloudItem.updatedAt).getTime() || 0

        if (cloudTime > localTime) {
          // Cloud is newer → pull to local
          await localPortfolio.upsert({
            id: cloudItem.id,
            assetKey: cloudItem.assetKey,
            assetType: cloudItem.assetType as 'STOCK' | 'ETF' | 'FUND',
            market: cloudItem.market as 'A_SHARE',
            code: cloudItem.code,
            symbol: cloudItem.assetType === 'STOCK' ? cloudItem.code : undefined,
            name: cloudItem.name ?? '',
            direction: cloudItem.direction as 'BUY' | 'SELL',
            shares: cloudItem.shares,
            avgCost: cloudItem.avgCost
          })
          portfolioPulled++
        } else if (localTime > cloudTime) {
          // Local is newer → collect for batch push to cloud
          updatesToCloud.push({
            id,
            data: {
              asset_key: localItem.assetKey,
              asset_type: localItem.assetType,
              market: localItem.market,
              code: localItem.code,
              name: localItem.name,
              direction: localItem.direction,
              shares: localItem.shares,
              avg_cost: localItem.avgCost,
              updated_at: now
            }
          })
        }
        // If same timestamp, skip — already in sync
      }

      // Batch push local-newer items to cloud
      for (const update of updatesToCloud) {
        const { error } = await supabase
          .from('portfolio_positions')
          .update(update.data)
          .eq('id', update.id)
        if (error) {
          errors.push(`持仓更新失败 ${update.id}: ${error.message}`)
        } else {
          portfolioPushed++
        }
      }
    }
  } catch (err) {
    errors.push(`持仓双向同步异常: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { watchlistPushed, watchlistPulled, portfolioPushed, portfolioPulled, errors }
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export async function syncData(direction: SyncDirection): Promise<SyncResult> {
  const result: SyncResult = {
    direction,
    watchlistPushed: 0,
    watchlistPulled: 0,
    portfolioPushed: 0,
    portfolioPulled: 0,
    errors: []
  }

  notifySyncStatus({ status: 'synced', message: '正在同步…' })

  try {
    if (direction === 'push') {
      const pushResult = await pushLocalToCloud()
      result.watchlistPushed = pushResult.watchlist
      result.portfolioPushed = pushResult.portfolio
      result.errors.push(...pushResult.errors)
    } else if (direction === 'pull') {
      const pullResult = await pullCloudToLocal()
      result.watchlistPulled = pullResult.watchlist
      result.portfolioPulled = pullResult.portfolio
      result.errors.push(...pullResult.errors)
    } else {
      // bidirectional — merge strategy
      const mergeResult = await bidirectionalMerge()
      result.watchlistPushed = mergeResult.watchlistPushed
      result.watchlistPulled = mergeResult.watchlistPulled
      result.portfolioPushed = mergeResult.portfolioPushed
      result.portfolioPulled = mergeResult.portfolioPulled
      result.errors.push(...mergeResult.errors)
    }

    if (result.errors.length > 0) {
      notifySyncStatus({ status: 'error', message: `同步完成，${result.errors.length} 个错误` })
    } else {
      notifySyncStatus({ status: 'synced', message: '同步完成' })
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
    notifySyncStatus({ status: 'error', message: '同步失败' })
  }

  return result
}
