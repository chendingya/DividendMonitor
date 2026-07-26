import { ipcMain } from 'electron'
import { listDividendHistory, type DividendHistoryRequest } from '@main/application/useCases/listDividendHistory'

export function registerDividendChannels() {
  ipcMain.handle('dividend:history', async (_event, request?: DividendHistoryRequest) => {
    return listDividendHistory(request)
  })
}
