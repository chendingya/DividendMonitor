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

/** 进程内订阅者（inprocess 运行时直连用例时注册），与广播器并行收到同一事件 */
const syncStatusListeners = new Set<(event: SyncStatusEvent) => void>()

/** 注入同步状态广播器（幂等覆盖）。传入的 fn 接收带时间戳的完整事件。 */
export function setSyncStatusBroadcaster(fn: (event: SyncStatusEvent) => void): void {
  syncStatusBroadcaster = fn
}

/**
 * 订阅同步状态（inprocess 运行时用）：注册内部监听者，返回取消订阅函数。
 * 不占用广播器注入位——notifySyncStatus 仍会先通知全部订阅者、再调用注入的广播器，
 * 桌面端 BrowserWindow 推送行为保持不变。
 */
export function subscribeSyncStatus(cb: (event: SyncStatusEvent) => void): () => void {
  syncStatusListeners.add(cb)
  return () => {
    syncStatusListeners.delete(cb)
  }
}

export function notifySyncStatus(status: SyncStatus): void {
  // 相同状态重复广播没有意义，还会覆盖其它同步源的较新状态。
  if (lastStatus.status === status.status && lastStatus.message === status.message) {
    return
  }
  lastStatus = status
  const event: SyncStatusEvent = { ...status, timestamp: Date.now() }
  for (const listener of syncStatusListeners) {
    listener(event)
  }
  syncStatusBroadcaster(event)
}

export function getLastSyncStatus(): SyncStatus {
  return lastStatus
}
