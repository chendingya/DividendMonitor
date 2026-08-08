import { ipcMain } from 'electron'
import { getCrossAssetComparison } from '@main/application/useCases/getCrossAssetComparison'

export function registerCrossAssetChannels() {
  ipcMain.handle('cross-asset:get-comparison', async () => {
    return getCrossAssetComparison()
  })
}
