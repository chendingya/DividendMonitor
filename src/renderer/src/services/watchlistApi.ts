import type { AssetQueryDto, WatchlistEntryDto } from '@shared/contracts/api'
import { buildStockAssetKey, createStockAssetQuery } from '@shared/contracts/api'
import { getWatchlistDesktopApi } from '@renderer/services/desktopApi'

export const watchlistApi = {
  async list(): Promise<WatchlistEntryDto[]> {
    return getWatchlistDesktopApi().list()
  },
  add(symbol: string) {
    return getWatchlistDesktopApi().addAsset(createStockAssetQuery(symbol))
  },
  remove(symbol: string) {
    return getWatchlistDesktopApi().removeAsset(buildStockAssetKey(symbol))
  },
  addAsset(request: string | AssetQueryDto) {
    return getWatchlistDesktopApi().addAsset(typeof request === 'string' ? { assetKey: request } : request)
  },
  removeAsset(assetKey: string) {
    return getWatchlistDesktopApi().removeAsset(assetKey)
  }
}

