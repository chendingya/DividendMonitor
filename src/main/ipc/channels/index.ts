import { registerStockChannels } from '@main/ipc/channels/stockChannels'

export function registerIpcHandlers() {
  registerStockChannels()
}
