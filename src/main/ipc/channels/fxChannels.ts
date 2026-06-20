import { ipcMain } from 'electron'
import { getUsdCnyRate } from '@main/application/useCases/getFxRateUseCase'

export function registerFxChannels() {
  ipcMain.handle('fx:usd-cny-rate', async () => {
    try {
      return await getUsdCnyRate()
    } catch (error) {
      // Fallback to a conservative rate when the FX endpoint is unavailable.
      // Renderer callers treat this as a soft value, not authoritative.
      console.warn('[fx:usd-cny-rate] failed, using fallback 7.2:', error)
      return 7.2
    }
  })
}
