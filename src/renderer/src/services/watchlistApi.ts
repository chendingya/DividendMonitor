import type { AssetQueryDto, WatchlistEntryDto, WatchlistGroupDto, WatchlistGroupUpsertDto, WatchlistGroupAssetActionDto } from '@shared/contracts/api'
import { buildStockAssetKey, createStockAssetQuery } from '@shared/contracts/api'
import { getWatchlistDesktopApi } from '@renderer/services/desktopApi'

const api = () => getWatchlistDesktopApi()

export const watchlistApi = {
  async list(): Promise<WatchlistEntryDto[]> {
    return api().list()
  },
  add(symbol: string) {
    return api().addAsset(createStockAssetQuery(symbol))
  },
  remove(symbol: string) {
    return api().removeAsset(buildStockAssetKey(symbol))
  },
  addAsset(request: string | AssetQueryDto) {
    return api().addAsset(typeof request === 'string' ? { assetKey: request } : request)
  },
  removeAsset(assetKey: string) {
    return api().removeAsset(assetKey)
  },
  listGroups(): Promise<WatchlistGroupDto[]> {
    return api().listGroups()
  },
  createGroup(request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
    return api().createGroup(request)
  },
  updateGroup(id: string, request: WatchlistGroupUpsertDto): Promise<WatchlistGroupDto> {
    return api().updateGroup(id, request)
  },
  deleteGroup(id: string): Promise<void> {
    return api().deleteGroup(id)
  },
  addToGroup(request: WatchlistGroupAssetActionDto): Promise<void> {
    return api().addToGroup(request)
  },
  removeFromGroup(request: WatchlistGroupAssetActionDto): Promise<void> {
    return api().removeFromGroup(request)
  },
  listGroupAssets(groupId: string): Promise<WatchlistEntryDto[]> {
    return api().listGroupAssets(groupId)
  },
  getAssetGroupIds(assetKey: string): Promise<string[]> {
    return api().getAssetGroupIds(assetKey)
  }
}

