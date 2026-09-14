import { app, BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startLocalHttpServer, stopLocalHttpServer } from '@main/http/server'
import { registerIpcHandlers } from '@main/ipc/channels'
import { AssetCacheSyncService } from '@main/application/services/assetCacheSyncService'
import { syncAllDividendEvents } from '@main/application/services/dividendSyncService'
import { authService } from '@main/infrastructure/supabase/authService'
import { migrateLegacySession } from '@main/infrastructure/supabase/sessionStorage'
import { installElectronSqliteProvider } from '@main/infrastructure/db/electronSqliteProvider'
import { installElectronBroadcasters } from '@main/infrastructure/supabase/electronBroadcasters'
import { getCspHeader } from '@main/security/contentSecurityPolicy'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const isDevelopment = Boolean(process.env['ELECTRON_RENDERER_URL'])
const isHeadlessRuntime = process.env['DIVIDEND_MONITOR_HEADLESS'] === '1'

if (isDevelopment) {
  // Keep Electron runtime data inside the workspace during development to avoid
  // permission issues from sandboxed roaming-profile writes.
  app.setPath('userData', join(process.cwd(), '.runtime-data'))
}

// 在任何 DB 使用之前安装 Electron SQLite provider（幂等；路径在首次 getDatabase 时惰性解析）
installElectronSqliteProvider()

// 安装 Electron 桌面端的 auth/sync 广播器（幂等；在 authService/syncStatusNotifier 首次广播前）
installElectronBroadcasters()

function createWindow() {
  const mainWindow = new BrowserWindow({
    title: '收息佬',
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Inject CSP headers for renderer pages to prevent XSS attacks
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [getCspHeader(isDevelopment)]
      }
    })
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Catch unhandled rejections globally to prevent crashes from network failures
process.on('unhandledRejection', (reason: Error) => {
  console.error('[Process] unhandledRejection:', reason?.message ?? reason)
})

// 日志管道断裂（如 dev 父进程退出后仍向已关闭的管道写日志）不应击穿主进程
process.stdout?.on('error', () => undefined)
process.stderr?.on('error', () => undefined)

app.whenReady().then(() => {
  // Migrate legacy plaintext session file to encrypted storage
  migrateLegacySession()

  registerIpcHandlers()
  void startLocalHttpServer()

  // Initialize auth session from persistent storage and start auth state listener.
  // Failure is non-fatal — the app works fully offline with local SQLite.
  authService.initSession().catch((err) => {
    console.warn('[Main] Auth session init failed, running in offline mode:', (err as Error).message)
  })

  const cacheSync = new AssetCacheSyncService()
  // Delay initial cache sync so the UI and user-initiated requests take priority.
  // This also avoids competing with the startup connection burst to push2.
  setTimeout(() => void cacheSync.syncFromWatchlist(), 15_000)

  // 启动后批量同步分红方案（落库），支撑自动除权除息与价格复权
  setTimeout(() => void syncAllDividendEvents(), 25_000)

  if (!isHeadlessRuntime) {
    createWindow()
  }

  app.on('activate', () => {
    if (!isHeadlessRuntime && BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void stopLocalHttpServer()
    app.quit()
  }
})
