import { BrowserWindow } from 'electron'

export type SyncStatus = {
  status: 'synced' | 'offline-fallback' | 'error'
  message?: string
}

export type SyncStatusEvent = SyncStatus & {
  timestamp: number
}

let lastStatus: SyncStatus = { status: 'synced' }

export function notifySyncStatus(status: SyncStatus): void {
  lastStatus = status
  const event: SyncStatusEvent = { ...status, timestamp: Date.now() }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:status-changed', event)
  }
}

export function getLastSyncStatus(): SyncStatus {
  return lastStatus
}
