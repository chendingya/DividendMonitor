import type { WatchlistEntryDto } from '@shared/contracts/api'
import { toWatchlistEntryDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'
import type { AssetDetailSource } from '@main/repositories/assetProviderRegistry'
import { AssetSnapshotRepository } from '@main/repositories/assetSnapshotRepository'
import type { WatchlistAssetRecord } from '@main/repositories/interfaces'

const QUOTE_DISPLAY_WAIT_MS = 2000

/** 限制列表等待时间；原请求继续落库，race 也会消费晚到的失败。 */
async function withinQuoteDisplayBudget<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Quote display wait exceeded')), QUOTE_DISPLAY_WAIT_MS)
      })
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** 行情是自选的补充信息；外部行情失败或长时间未返回不能隐藏用户保存的资产。 */
export async function loadWatchlistEntries(assets: WatchlistAssetRecord[]): Promise<WatchlistEntryDto[]> {
  const assetRepository = new AssetRepository()
  const snapshots = new AssetSnapshotRepository()

  return Promise.all(assets.map(async (asset): Promise<WatchlistEntryDto> => {
    try {
      return toWatchlistEntryDto(await withinQuoteDisplayBudget(
        assetRepository.getDetail({ assetKey: asset.assetKey })
      ))
    } catch {
      try {
        const snapshot = await snapshots.findByKey(asset.assetKey)
        if (snapshot) {
          const cached = toWatchlistEntryDto(JSON.parse(snapshot.dataJson) as AssetDetailSource)
          if (cached.assetKey === asset.assetKey && Number.isFinite(cached.latestPrice)) {
            return {
              ...cached,
              name: asset.name?.trim() || cached.name,
              quoteStatus: 'stale',
              quoteUpdatedAt: snapshot.fetchedAt
            }
          }
        }
      } catch {
        // 损坏的行情缓存也不应使用户保存的自选消失。
      }
      return {
        assetKey: asset.assetKey,
        assetType: asset.assetType,
        market: asset.market,
        code: asset.code,
        symbol: asset.assetType === 'STOCK' ? asset.code : undefined,
        name: asset.name?.trim() || asset.code,
        quoteStatus: 'unavailable'
      }
    }
  }))
}
