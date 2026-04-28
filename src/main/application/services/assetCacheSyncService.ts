import { AssetRepository } from '@main/repositories/assetRepository'
import { AssetSnapshotRepository } from '@main/repositories/assetSnapshotRepository'
import { WatchlistRepository } from '@main/repositories/watchlistRepository'
import { FIXED_POOL_ASSET_KEYS, getAssetTtlMs } from '@main/infrastructure/config/assetCacheConfig'
import { parseAssetKey } from '@shared/contracts/api'

export class AssetCacheSyncService {
  constructor(
    private readonly assetRepository: AssetRepository = new AssetRepository(),
    private readonly watchlistRepository: WatchlistRepository = new WatchlistRepository(),
    private readonly snapshotRepository: AssetSnapshotRepository = new AssetSnapshotRepository()
  ) {}

  async syncFromWatchlist(): Promise<void> {
    const startTime = Date.now()
    console.log('[AssetCacheSync] Starting background cache sync...')

    try {
      const watchlistAssets = await this.watchlistRepository.listAssets()
      const allKeys = new Set<string>()

      for (const asset of watchlistAssets) {
        allKeys.add(asset.assetKey)
      }
      for (const key of FIXED_POOL_ASSET_KEYS) {
        allKeys.add(key)
      }

      if (allKeys.size === 0) {
        console.log('[AssetCacheSync] No assets to sync.')
        return
      }

      const existingRows = this.snapshotRepository.findByKeys([...allKeys])
      const staleKeys: string[] = []

      for (const assetKey of allKeys) {
        const parsed = parseAssetKey(assetKey)
        if (!parsed) continue

        const row = existingRows.get(assetKey)
        if (!row) {
          staleKeys.push(assetKey)
          continue
        }

        const age = Date.now() - new Date(row.fetchedAt).getTime()
        if (age >= getAssetTtlMs(parsed.assetType)) {
          staleKeys.push(assetKey)
        }
      }

      if (staleKeys.length === 0) {
        console.log('[AssetCacheSync] All assets are fresh.')
        return
      }

      console.log(`[AssetCacheSync] Refreshing ${staleKeys.length} stale entries...`)
      const results = await Promise.allSettled(
        staleKeys.map((assetKey) =>
          this.assetRepository.getDetail({ assetKey }).catch((err) => {
            console.warn(`[AssetCacheSync] Failed to refresh ${assetKey}:`, err)
          })
        )
      )

      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length
      const elapsed = Date.now() - startTime
      console.log(`[AssetCacheSync] Done: ${succeeded} refreshed, ${failed} failed, ${elapsed}ms`)

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      this.snapshotRepository.removeOlderThan(sevenDaysAgo)
    } catch (err) {
      console.error('[AssetCacheSync] Sync failed:', err)
    }
  }
}
