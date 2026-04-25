import { ipcMain } from 'electron'
import { addWatchlistItem } from '@main/application/useCases/addWatchlistItem'
import { listWatchlist } from '@main/application/useCases/listWatchlist'
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
}
