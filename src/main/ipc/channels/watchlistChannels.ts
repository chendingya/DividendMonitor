import { ipcMain } from 'electron'
import type { WatchlistAddRequestDto } from '@shared/contracts/api'
import { addWatchlistAsset } from '@main/application/useCases/addWatchlistAsset'
import { addWatchlistItem } from '@main/application/useCases/addWatchlistItem'
import { listWatchlist } from '@main/application/useCases/listWatchlist'
import { removeWatchlistAsset } from '@main/application/useCases/removeWatchlistAsset'
import { removeWatchlistItem } from '@main/application/useCases/removeWatchlistItem'

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
}
