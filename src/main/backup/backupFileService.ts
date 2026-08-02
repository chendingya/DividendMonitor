import { copyFileSync, openSync, readSync, closeSync, statSync } from 'node:fs'

const SQLITE_MAGIC = Buffer.from('SQLite format 3\u0000')

export function copySqliteFile(source: string, destination: string): void {
  copyFileSync(source, destination)
}

/** SQLite 文件头固定 16 字节魔数，用于恢复前校验所选文件是否为有效 SQLite 数据库。 */
export function isValidSqliteFile(path: string): boolean {
  try {
    const stat = statSync(path)
    if (!stat.isFile() || stat.size < 16) {
      return false
    }
    const fd = openSync(path, 'r')
    try {
      const header = Buffer.alloc(16)
      const bytesRead = readSync(fd, header, 0, 16, 0)
      return bytesRead === 16 && header.equals(SQLITE_MAGIC)
    } finally {
      closeSync(fd)
    }
  } catch {
    return false
  }
}

function formatTimestamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

export function buildBackupFileName(now: Date): string {
  return `dividend-monitor-backup-${formatTimestamp(now)}.sqlite`
}

export function buildPreRestoreFileName(now: Date): string {
  return `pre-restore-${formatTimestamp(now)}.sqlite`
}
