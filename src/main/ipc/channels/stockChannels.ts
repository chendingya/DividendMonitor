import { ipcMain } from 'electron'
import { createStockAssetQuery } from '@shared/contracts/api'
import { compareAssets } from '@main/application/useCases/compareAssets'
import { getAssetDetail } from '@main/application/useCases/getAssetDetail'
import { searchAssets } from '@main/application/useCases/searchAssets'

export function registerStockChannels() {
  ipcMain.handle('stock:search', async (_event, keyword: string) => {
    return searchAssets({
      keyword,
      assetTypes: ['STOCK']
    })
  })

  ipcMain.handle('stock:get-detail', async (_event, symbol: string) => {
    return getAssetDetail(createStockAssetQuery(symbol))
  })

  ipcMain.handle('stock:compare', async (_event, symbols: string[]) => {
    return compareAssets({
      items: symbols.map((symbol) => createStockAssetQuery(symbol))
    })
  })
}
