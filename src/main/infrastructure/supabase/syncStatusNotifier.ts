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
  // 相同状态重复广播没有意义，还会覆盖其它同步源的较新状态。
  if (lastStatus.status === status.status && lastStatus.message === status.message) {
    return
  }
  lastStatus = status
  const event: SyncStatusEvent = { ...status, timestamp: Date.now() }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:status-changed', event)
  }
}

export function getLastSyncStatus(): SyncStatus {
  return lastStatus
}
