import { app, BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startLocalHttpServer, stopLocalHttpServer } from '@main/http/server'
import { registerIpcHandlers } from '@main/ipc/channels'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const isDevelopment = Boolean(process.env['ELECTRON_RENDERER_URL'])
const isHeadlessRuntime = process.env['DIVIDEND_MONITOR_HEADLESS'] === '1'

if (isDevelopment) {
  // Keep Electron runtime data inside the workspace during development to avoid
  // permission issues from sandboxed roaming-profile writes.
  app.setPath('userData', join(process.cwd(), '.runtime-data'))
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    title: '收息佬',
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  void startLocalHttpServer()
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
