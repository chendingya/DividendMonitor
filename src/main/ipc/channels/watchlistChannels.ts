import { ipcMain } from 'electron'
import type { WatchlistAddRequestDto, WatchlistGroupAssetActionDto, WatchlistGroupUpsertDto } from '@shared/contracts/api'
import { addWatchlistAsset } from '@main/application/useCases/addWatchlistAsset'
import { addWatchlistItem } from '@main/application/useCases/addWatchlistItem'
import { listWatchlist } from '@main/application/useCases/listWatchlist'
import { removeWatchlistAsset } from '@main/application/useCases/removeWatchlistAsset'
import { removeWatchlistItem } from '@main/application/useCases/removeWatchlistItem'
import { listWatchlistGroups } from '@main/application/useCases/listWatchlistGroups'
import { createWatchlistGroup } from '@main/application/useCases/createWatchlistGroup'
import { updateWatchlistGroup } from '@main/application/useCases/updateWatchlistGroup'
import { deleteWatchlistGroup } from '@main/application/useCases/deleteWatchlistGroup'
import { addAssetToWatchlistGroup } from '@main/application/useCases/addAssetToWatchlistGroup'
import { removeAssetFromWatchlistGroup } from '@main/application/useCases/removeAssetFromWatchlistGroup'
import { listWatchlistGroupAssets } from '@main/application/useCases/listWatchlistGroupAssets'
import { getAssetGroupIds } from '@main/application/useCases/getAssetGroupIds'

export function registerWatchlistChannels() {
  ipcMain.handle('watchlist:list', async () => {
    return listWatchlist()
  })

  ipcMain.handle('watchlist:add', async (_event, symbol: string) => {
    return addWatchlistItem(symbol)
  })

  ipcMain.handle('watchlist:remove', async (_event, symbol: string) => {
    return removeWatchlistItem(symbol)
  })

  ipcMain.handle('watchlist:add-asset', async (_event, request: WatchlistAddRequestDto) => {
    return addWatchlistAsset(request)
  })

  ipcMain.handle('watchlist:remove-asset', async (_event, assetKey: string) => {
    return removeWatchlistAsset(assetKey)
  })

  ipcMain.handle('watchlist:list-groups', async () => {
    return listWatchlistGroups()
  })

  ipcMain.handle('watchlist:create-group', async (_event, request: WatchlistGroupUpsertDto) => {
    return createWatchlistGroup(request)
  })

  ipcMain.handle('watchlist:update-group', async (_event, id: string, request: WatchlistGroupUpsertDto) => {
    return updateWatchlistGroup(id, request)
  })

  ipcMain.handle('watchlist:delete-group', async (_event, id: string) => {
    return deleteWatchlistGroup(id)
  })

  ipcMain.handle('watchlist:add-to-group', async (_event, request: WatchlistGroupAssetActionDto) => {
    return addAssetToWatchlistGroup(request)
  })

  ipcMain.handle('watchlist:remove-from-group', async (_event, request: WatchlistGroupAssetActionDto) => {
    return removeAssetFromWatchlistGroup(request)
  })

  ipcMain.handle('watchlist:list-group-assets', async (_event, groupId: string) => {
    return listWatchlistGroupAssets(groupId)
  })

  ipcMain.handle('watchlist:get-asset-group-ids', async (_event, assetKey: string) => {
    return getAssetGroupIds(assetKey)
  })
}
