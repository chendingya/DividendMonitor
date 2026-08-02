import { copyFileSync } from 'node:fs'

export function copySqliteFile(source: string, destination: string): void {
  copyFileSync(source, destination)
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
