import { ipcMain } from 'electron'
import { getMarketYieldMap, refreshMarketYieldMap } from '@main/application/useCases/getMarketYieldMap'

export function registerYieldMapChannels() {
  ipcMain.handle('yield-map:get', async () => {
    return getMarketYieldMap()
  })
  ipcMain.handle('yield-map:refresh', async () => {
    return refreshMarketYieldMap()
  })
}
