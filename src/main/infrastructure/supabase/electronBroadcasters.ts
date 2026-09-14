import { BrowserWindow } from 'electron'
import { setAuthStateBroadcaster } from './authService'
import { setSyncStatusBroadcaster, type SyncStatusEvent } from './syncStatusNotifier'

let installed = false

/**
 * 安装 Electron 桌面端的 auth/sync 广播器（幂等）。
 * 把 authService / syncStatusNotifier 的状态变更通过 webContents 推送给所有窗口。
 * 必须在 authService / syncStatusNotifier 首次广播前调用（main/index.ts 启动期完成）。
 */
export function installElectronBroadcasters(): void {
  if (installed) {
    return
  }
  installed = true

  setAuthStateBroadcaster((session) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('auth:state-changed', session)
    }
  })

  setSyncStatusBroadcaster((event: SyncStatusEvent) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('sync:status-changed', event)
    }
  })
}
