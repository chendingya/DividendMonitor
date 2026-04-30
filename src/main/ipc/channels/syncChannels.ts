import { ipcMain } from 'electron'
import { syncData, type SyncDirection, type SyncResult } from '@main/application/services/dataSyncService'

export function registerSyncChannels(): void {
  ipcMain.handle('sync:data', async (_event, direction: SyncDirection): Promise<SyncResult> => {
    try {
      return await syncData(direction)
    } catch (err) {
      return {
        direction,
        watchlistPushed: 0,
        watchlistPulled: 0,
        portfolioPushed: 0,
        portfolioPulled: 0,
        errors: [err instanceof Error ? err.message : String(err)]
      }
    }
  })
}
