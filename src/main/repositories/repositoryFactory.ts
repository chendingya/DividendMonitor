import { getRuntimeMode, type AppRuntimeMode } from '@main/infrastructure/supabase/runtimeMode'
import { WatchlistRepository } from '@main/repositories/watchlistRepository'
import { SupabaseWatchlistRepository } from '@main/repositories/supabaseWatchlistRepository'
import { PortfolioRepository } from '@main/repositories/portfolioRepository'
import { SupabasePortfolioRepository } from '@main/repositories/supabasePortfolioRepository'
import type { IWatchlistRepository, IPortfolioRepository } from '@main/repositories/interfaces'
import { AssetSnapshotRepository } from '@main/repositories/assetSnapshotRepository'

let watchlistInstance: IWatchlistRepository | null = null
let portfolioInstance: IPortfolioRepository | null = null
let assetSnapshotInstance: AssetSnapshotRepository | null = null

export function getWatchlistRepository(mode?: AppRuntimeMode): IWatchlistRepository {
  const runtimeMode = mode ?? getRuntimeMode()
  if (runtimeMode === 'online') {
    if (!(watchlistInstance instanceof SupabaseWatchlistRepository)) {
      watchlistInstance = new SupabaseWatchlistRepository()
    }
    return watchlistInstance
  }
  if (!(watchlistInstance instanceof WatchlistRepository)) {
    watchlistInstance = new WatchlistRepository()
  }
  return watchlistInstance
}

export function getPortfolioRepository(mode?: AppRuntimeMode): IPortfolioRepository {
  const runtimeMode = mode ?? getRuntimeMode()
  if (runtimeMode === 'online') {
    if (!(portfolioInstance instanceof SupabasePortfolioRepository)) {
      portfolioInstance = new SupabasePortfolioRepository()
    }
    return portfolioInstance
  }
  if (!(portfolioInstance instanceof PortfolioRepository)) {
    portfolioInstance = new PortfolioRepository()
  }
  return portfolioInstance
}

export function getAssetSnapshotRepository(): AssetSnapshotRepository {
  // Asset snapshots are local-only cache of external API data;
  // they do not need Supabase sync in the current phase.
  return assetSnapshotInstance ?? (assetSnapshotInstance = new AssetSnapshotRepository())
}
