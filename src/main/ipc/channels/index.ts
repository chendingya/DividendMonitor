import { registerAssetChannels } from '@main/ipc/channels/assetChannels'
import { registerCalculationChannels } from '@main/ipc/channels/calculationChannels'
import { registerPortfolioChannels } from '@main/ipc/channels/portfolioChannels'
import { registerStockChannels } from '@main/ipc/channels/stockChannels'
import { registerWatchlistChannels } from '@main/ipc/channels/watchlistChannels'

export function registerIpcHandlers() {
  registerAssetChannels()
  registerCalculationChannels()
  registerPortfolioChannels()
  registerStockChannels()
  registerWatchlistChannels()
}
