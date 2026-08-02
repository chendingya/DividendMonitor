import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

const tempDir = mkdtempSync(join(tmpdir(), 'sqlite-close-'))
const userDataDir = join(tempDir, 'userdata')

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir }
}))

const sqlite = await import('@main/infrastructure/db/sqlite')

describe('sqlite close/reopen', () => {
  beforeEach(() => {
    sqlite.closeDatabase()
  })

  afterAll(() => {
    sqlite.closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('getDatabase creates a file and closeDatabase releases it', () => {
    const db = sqlite.getDatabase()
    db.prepare('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)').run()
    const filePath = sqlite.getDatabaseFilePath()
    expect(filePath).toContain('dividend-monitor.sqlite')

    sqlite.closeDatabase()
    expect(() => {
      db.prepare('SELECT 1').get()
    }).toThrow()
  })

  it('getDatabase reopens the same file after closeDatabase with data intact', () => {
    const db = sqlite.getDatabase()
    db.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)')
    db.prepare('INSERT INTO t (id) VALUES (1)').run()
    sqlite.closeDatabase()

    const reopened = sqlite.getDatabase()
    const row = reopened.prepare('SELECT id FROM t').get() as { id: number }
    expect(row.id).toBe(1)
  })
})
