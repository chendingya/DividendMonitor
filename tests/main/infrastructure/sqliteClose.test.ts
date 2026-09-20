import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const tempDir = mkdtempSync(join(tmpdir(), 'sqlite-close-'))
const userDataDir = join(tempDir, 'userdata')

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir }
}))

const sqlite = await import('@main/infrastructure/db/sqlite')
const { getDatabaseFilePath, installElectronSqliteProvider } = await import(
  '@main/infrastructure/db/electronSqliteProvider'
)

await installElectronSqliteProvider()

describe('sqlite close/reopen', () => {
  beforeEach(async () => {
    await sqlite.closeDatabase()
    await installElectronSqliteProvider()
  })

  afterAll(async () => {
    await sqlite.closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('getDatabase creates a file and closeDatabase releases it', async () => {
    const db = sqlite.getDatabase()
    await db.prepare('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)').run()
    const filePath = getDatabaseFilePath()
    expect(filePath).toContain('dividend-monitor.sqlite')

    await sqlite.closeDatabase()
    await expect(db.prepare('SELECT 1').get()).rejects.toThrow()
  })

  it('getDatabase reopens the same file after closeDatabase with data intact', async () => {
    const db = sqlite.getDatabase()
    await db.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)')
    await db.prepare('INSERT INTO t (id) VALUES (1)').run()
    await sqlite.closeDatabase()

    await installElectronSqliteProvider()
    const reopened = sqlite.getDatabase()
    const row = (await reopened.prepare('SELECT id FROM t').get()) as { id: number }
    expect(row.id).toBe(1)
  })
})
