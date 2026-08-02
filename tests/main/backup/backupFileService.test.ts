import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildBackupFileName, buildPreRestoreFileName, copySqliteFile } from '@main/backup/backupFileService'

const tempDir = mkdtempSync(join(tmpdir(), 'backup-svc-'))

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('backupFileService', () => {
  it('copies a file to destination', () => {
    const source = join(tempDir, 'src.sqlite')
    const dest = join(tempDir, 'dest.sqlite')
    writeFileSync(source, 'file-content-123')

    copySqliteFile(source, dest)

    expect(readFileSync(dest, 'utf8')).toBe('file-content-123')
  })

  it('throws when source is missing', () => {
    expect(() => copySqliteFile(join(tempDir, 'missing.sqlite'), join(tempDir, 'out.sqlite'))).toThrow()
  })

  it('builds backup file name from timestamp without colons', () => {
    const name = buildBackupFileName(new Date('2026-08-02T10:30:45.000Z'))
    expect(name).toBe('dividend-monitor-backup-2026-08-02T10-30-45.sqlite')
  })

  it('builds pre-restore file name from timestamp', () => {
    const name = buildPreRestoreFileName(new Date('2026-08-02T10:30:45.000Z'))
    expect(name).toBe('pre-restore-2026-08-02T10-30-45.sqlite')
  })
})
