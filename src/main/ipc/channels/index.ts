import { registerCalculationChannels } from '@main/ipc/channels/calculationChannels'
import { registerStockChannels } from '@main/ipc/channels/stockChannels'
import { registerWatchlistChannels } from '@main/ipc/channels/watchlistChannels'

export function registerIpcHandlers() {
  registerCalculationChannels()
  registerStockChannels()
  registerWatchlistChannels()
}
