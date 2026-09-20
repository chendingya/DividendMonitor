import { BrowserWindow, dialog, ipcMain } from 'electron'
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { closeDatabase } from '@main/infrastructure/db/sqlite'
import { getDatabaseFilePath, installElectronSqliteProvider } from '@main/infrastructure/db/electronSqliteProvider'
import { buildBackupFileName, buildPreRestoreFileName, copySqliteFile, isValidSqliteFile } from '@main/backup/backupFileService'

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
    // 先关闭数据库再复制，完成后重新初始化连接。
    await closeDatabase()
    try {
      copySqliteFile(dbPath, result.filePath)
    } finally {
      await installElectronSqliteProvider()
    }
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
    if (!isValidSqliteFile(backupPath)) {
      throw new Error('所选文件不是有效的 SQLite 备份，已取消恢复')
    }

    const dbPath = getDatabaseFilePath()

    // 先关闭数据库（保持文件一致），再备份当前库、写入备份文件
    await closeDatabase()
    const preRestorePath = join(dirname(dbPath), buildPreRestoreFileName(new Date()))
    try {
      copySqliteFile(dbPath, preRestorePath)
      copySqliteFile(backupPath, dbPath)
    } finally {
      await installElectronSqliteProvider()
    }

    return { canceled: false, restored: true }
  })
}
