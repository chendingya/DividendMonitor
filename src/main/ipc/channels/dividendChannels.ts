import { ipcMain } from 'electron'
import { listDividendHistory, type DividendHistoryRequest } from '@main/application/useCases/listDividendHistory'
import { listUpcomingDividends } from '@main/application/useCases/listUpcomingDividends'
import { getDividendForecast } from '@main/application/useCases/getDividendForecast'

export function registerDividendChannels() {
  ipcMain.handle('dividend:history', async (_event, request?: DividendHistoryRequest) => {
    return listDividendHistory(request)
  })
  ipcMain.handle('dividend:upcoming', async () => {
    return listUpcomingDividends()
  })
  ipcMain.handle('dividend:forecast', async (_event, year?: number) => {
    return getDividendForecast(year)
  })
}
