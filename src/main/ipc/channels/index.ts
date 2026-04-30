import { ipcMain } from 'electron'
import { registerAssetChannels } from '@main/ipc/channels/assetChannels'
import { registerAuthChannels } from '@main/ipc/channels/authChannels'
import { registerCalculationChannels } from '@main/ipc/channels/calculationChannels'
import { registerPortfolioChannels } from '@main/ipc/channels/portfolioChannels'
import { registerStockChannels } from '@main/ipc/channels/stockChannels'
import { registerSyncChannels } from '@main/ipc/channels/syncChannels'
import { registerWatchlistChannels } from '@main/ipc/channels/watchlistChannels'
import { getNonce } from '@main/security/localNonce'

export function registerIpcHandlers() {
  registerAssetChannels()
  registerAuthChannels()
  registerCalculationChannels()
  registerPortfolioChannels()
  registerStockChannels()
  registerSyncChannels()
  registerWatchlistChannels()

  // Expose local HTTP nonce to renderer for authenticating HTTP auth requests
  ipcMain.handle('security:getLocalNonce', () => getNonce())
}
