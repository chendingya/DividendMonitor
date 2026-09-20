import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ handlers: new Map<string, () => Promise<unknown>>(), closed: false, copies: 0, failAt: 0 }))
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null },
  dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['backup.sqlite'] }) },
  ipcMain: { handle: (name: string, handler: () => Promise<unknown>) => state.handlers.set(name, handler) }
}))
vi.mock('@main/infrastructure/db/sqlite', () => ({ closeDatabase: async () => { state.closed = true } }))
vi.mock('@main/infrastructure/db/electronSqliteProvider', () => ({
  getDatabaseFilePath: () => 'local.sqlite',
  installElectronSqliteProvider: async () => { state.closed = false }
}))
vi.mock('@main/backup/backupFileService', () => ({
  buildBackupFileName: () => 'backup.sqlite', buildPreRestoreFileName: () => 'before.sqlite', isValidSqliteFile: () => true,
  copySqliteFile: () => {
    expect(state.closed).toBe(true)
    state.copies++
    if (state.failAt === state.copies) throw new Error('copy failed')
  }
}))
import { registerBackupChannels } from '@main/ipc/channels/backupChannels'
beforeEach(() => { state.closed = false; state.copies = 0; state.failAt = 0; state.handlers.clear(); registerBackupChannels() })
describe('restore reopens the desktop database', () => {
  it('makes the restored connection available before the handler resolves', async () => {
    expect(await state.handlers.get('backup:restore')!()).toEqual({ canceled: false, restored: true })
    expect(state.copies).toBe(2)
    expect(state.closed).toBe(false)
  })
  it.each([1, 2])('reopens after copy %s fails', async (failAt) => {
    state.failAt = failAt
    await expect(state.handlers.get('backup:restore')!()).rejects.toThrow('copy failed')
    expect(state.closed).toBe(false)
  })
})
