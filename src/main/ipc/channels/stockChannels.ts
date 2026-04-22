import { ipcMain } from 'electron'
import { compareStocks } from '@main/application/useCases/compareStocks'
import { getStockDetail } from '@main/application/useCases/getStockDetail'
import { searchStocks } from '@main/application/useCases/searchStocks'

export function registerStockChannels() {
  ipcMain.handle('stock:search', async (_event, keyword: string) => {
    return searchStocks(keyword)
  })

  ipcMain.handle('stock:get-detail', async (_event, symbol: string) => {
    return getStockDetail(symbol)
  })

  ipcMain.handle('stock:compare', async (_event, symbols: string[]) => {
    return compareStocks(symbols)
  })
}
