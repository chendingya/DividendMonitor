import { BrowserWindow, dialog, ipcMain } from 'electron'
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { closeDatabase, getDatabaseFilePath } from '@main/infrastructure/db/sqlite'
import { buildBackupFileName, buildPreRestoreFileName, copySqliteFile } from '@main/backup/backupFileService'

const SQLITE_FILTER = [{ name: 'SQLite 数据库', extensions: ['sqlite'] }]

export function registerBackupChannels(): void {
  ipcMain.handle('backup:create', async () => {
    const window = BrowserWindow.getFocusedWindow()
    const options = {
      title: '导出数据备份',
      defaultPath: buildBackupFileName(new Date()),
      filters: SQLITE_FILTER
    }
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)

    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }

    const dbPath = getDatabaseFilePath()
    copySqliteFile(dbPath, result.filePath)
    const size = statSync(result.filePath).size
    return { canceled: false, path: result.filePath, size }
  })

  ipcMain.handle('backup:restore', async () => {
    const window = BrowserWindow.getFocusedWindow()
    const options = {
      title: '选择要恢复的备份文件',
      filters: SQLITE_FILTER,
      properties: ['openFile'] as Array<'openFile'>
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    const backupPath = result.filePaths[0]
    const dbPath = getDatabaseFilePath()

    // 恢复前自动创建安全备份，防止误覆盖
    const preRestorePath = join(dirname(dbPath), buildPreRestoreFileName(new Date()))
    copySqliteFile(dbPath, preRestorePath)

    closeDatabase()
    copySqliteFile(backupPath, dbPath)

    return { canceled: false, restored: true }
  })
}
