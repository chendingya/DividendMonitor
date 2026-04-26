import { ipcMain } from 'electron'
import type { AssetCompareRequestDto, AssetQueryDto, AssetSearchRequestDto } from '@shared/contracts/api'
import { compareAssets } from '@main/application/useCases/compareAssets'
import { getAssetDetail } from '@main/application/useCases/getAssetDetail'
import { searchAssets } from '@main/application/useCases/searchAssets'

export function registerAssetChannels() {
  ipcMain.handle('asset:search', async (_event, request: AssetSearchRequestDto) => {
    return searchAssets(request)
  })

  ipcMain.handle('asset:get-detail', async (_event, request: AssetQueryDto) => {
    return getAssetDetail(request)
  })

  ipcMain.handle('asset:compare', async (_event, request: AssetCompareRequestDto) => {
    return compareAssets(request)
  })
}
