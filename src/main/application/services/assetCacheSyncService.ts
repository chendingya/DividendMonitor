import { AssetRepository } from '@main/repositories/assetRepository'
import { getWatchlistRepository, getAssetSnapshotRepository } from '@main/repositories/repositoryFactory'
import { FIXED_POOL_ASSET_KEYS, getAssetTtlMs } from '@main/infrastructure/config/assetCacheConfig'
import { parseAssetKey } from '@shared/contracts/api'

const MAX_RETRY_ATTEMPTS = 2
const RETRY_DELAY_MS = 2000
// Max concurrent asset refreshes. Each getDetail() makes up to 4 parallel
// HTTP requests, so 3 concurrent assets ≈ 12 sockets — within the default
// EventEmitter maxListeners limit of 10 per socket (with some headroom).
const MAX_CONCURRENCY = 3

function isNetworkError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('NETWORK')
}

async function retryNetworkOp<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt < MAX_RETRY_ATTEMPTS && isNetworkError(err)) {
        console.warn(`[AssetCacheSync] ${label} failed (attempt ${attempt}), retrying in ${RETRY_DELAY_MS}ms...`)
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Run async tasks with bounded concurrency (no external deps needed). */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++
      try {
        const value = await tasks[index]()
        results[index] = { status: 'fulfilled', value }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  const workerCount = Math.min(concurrency, tasks.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

export class AssetCacheSyncService {
  constructor(
    private readonly assetRepository: AssetRepository = new AssetRepository(),
    private readonly watchlistRepository = getWatchlistRepository(),
    private readonly snapshotRepository = getAssetSnapshotRepository()
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
      const results = await runWithConcurrency(
        staleKeys.map((assetKey) => () =>
          retryNetworkOp(() => this.assetRepository.getDetail({ assetKey }), assetKey)
        ),
        MAX_CONCURRENCY
      )

      let succeeded = 0
      let failed = 0
      for (const result of results) {
        if (result.status === 'fulfilled') {
          succeeded++
        } else {
          failed++
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
          // Extract assetKey from the error context (it's the index in staleKeys)
          console.warn(`[AssetCacheSync] Failed to refresh: ${reason}`)
        }
      }

      const elapsed = Date.now() - startTime
      console.log(`[AssetCacheSync] Done: ${succeeded} refreshed, ${failed} failed, ${elapsed}ms`)

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      this.snapshotRepository.removeOlderThan(sevenDaysAgo)
    } catch (err) {
      console.error('[AssetCacheSync] Sync failed:', err)
    }
  }
}
