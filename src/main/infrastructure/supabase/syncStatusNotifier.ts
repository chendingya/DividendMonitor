export type SyncStatus = {
  status: 'synced' | 'offline-fallback' | 'error'
  message?: string
}

export type SyncStatusEvent = SyncStatus & {
  timestamp: number
}

let lastStatus: SyncStatus = { status: 'synced' }

/** 状态广播器（默认 no-op）：桌面端由 electronBroadcasters 注入 BrowserWindow 推送实现 */
let syncStatusBroadcaster: (event: SyncStatusEvent) => void = () => undefined

/** 注入同步状态广播器（幂等覆盖）。传入的 fn 接收带时间戳的完整事件。 */
export function setSyncStatusBroadcaster(fn: (event: SyncStatusEvent) => void): void {
  syncStatusBroadcaster = fn
}

export function notifySyncStatus(status: SyncStatus): void {
  // 相同状态重复广播没有意义，还会覆盖其它同步源的较新状态。
  if (lastStatus.status === status.status && lastStatus.message === status.message) {
    return
  }
  lastStatus = status
  const event: SyncStatusEvent = { ...status, timestamp: Date.now() }
  syncStatusBroadcaster(event)
}

export function getLastSyncStatus(): SyncStatus {
  return lastStatus
}
