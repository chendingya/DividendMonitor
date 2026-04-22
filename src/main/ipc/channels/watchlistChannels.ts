import { ipcMain } from 'electron'
import { listWatchlist } from '@main/application/useCases/listWatchlist'

export function registerWatchlistChannels() {
  ipcMain.handle('watchlist:list', async () => {
    return listWatchlist()
  })
}
