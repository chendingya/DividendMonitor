import { ipcMain } from 'electron'
import { getStockDetail } from '@main/application/useCases/getStockDetail'
import { searchStocks } from '@main/application/useCases/searchStocks'

export function registerStockChannels() {
  ipcMain.handle('stock:search', async (_event, keyword: string) => {
    return searchStocks(keyword)
  })

  ipcMain.handle('stock:get-detail', async (_event, symbol: string) => {
    return getStockDetail(symbol)
  })
}
