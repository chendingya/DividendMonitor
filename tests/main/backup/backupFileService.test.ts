import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildBackupFileName, buildPreRestoreFileName, copySqliteFile, isValidSqliteFile } from '@main/backup/backupFileService'

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

  it('accepts a real SQLite file header', () => {
    const sqlite = join(tempDir, 'real.sqlite')
    writeFileSync(sqlite, 'SQLite format 3\u0000' + 'x'.repeat(64))

    expect(isValidSqliteFile(sqlite)).toBe(true)
  })

  it('rejects a non-SQLite file', () => {
    const plain = join(tempDir, 'plain.txt')
    writeFileSync(plain, 'SQLite format 3' + 'x'.repeat(64))

    expect(isValidSqliteFile(plain)).toBe(false)
  })

  it('rejects files smaller than the 16-byte header', () => {
    const tiny = join(tempDir, 'tiny.sqlite')
    writeFileSync(tiny, 'short')

    expect(isValidSqliteFile(tiny)).toBe(false)
  })

  it('rejects a missing file', () => {
    expect(isValidSqliteFile(join(tempDir, 'missing.sqlite'))).toBe(false)
  })
})
