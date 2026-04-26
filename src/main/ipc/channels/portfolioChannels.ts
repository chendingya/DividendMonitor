import { ipcMain } from 'electron'
import type { AssetQueryDto, PortfolioPositionReplaceByAssetDto, PortfolioPositionUpsertDto } from '@shared/contracts/api'
import { listPortfolioPositions } from '@main/application/useCases/listPortfolioPositions'
import { removePortfolioPosition } from '@main/application/useCases/removePortfolioPosition'
import { removePortfolioPositionsByAsset } from '@main/application/useCases/removePortfolioPositionsByAsset'
import { replacePortfolioPositionsByAsset } from '@main/application/useCases/replacePortfolioPositionsByAsset'
import { upsertPortfolioPosition } from '@main/application/useCases/upsertPortfolioPosition'

export function registerPortfolioChannels() {
  ipcMain.handle('portfolio:list', async () => {
    return listPortfolioPositions()
  })

  ipcMain.handle('portfolio:upsert', async (_event, request: PortfolioPositionUpsertDto) => {
    return upsertPortfolioPosition(request)
  })

  ipcMain.handle('portfolio:remove', async (_event, id: string) => {
    return removePortfolioPosition(id)
  })

  ipcMain.handle('portfolio:remove-by-asset', async (_event, request: AssetQueryDto) => {
    return removePortfolioPositionsByAsset(request)
  })

  ipcMain.handle('portfolio:replace-by-asset', async (_event, request: PortfolioPositionReplaceByAssetDto) => {
    return replacePortfolioPositionsByAsset(request)
  })
}
