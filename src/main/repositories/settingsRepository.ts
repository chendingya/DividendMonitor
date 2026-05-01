import { getDatabase } from '@main/infrastructure/db/sqlite'
import type { SettingsEntity, RefreshStrategy, SortMetric } from '@main/domain/entities/Settings'
import { DEFAULT_SETTINGS } from '@main/domain/entities/Settings'

function serializeValue(value: unknown): string {
  if (typeof value === 'object' || Array.isArray(value)) {
    return JSON.stringify(value)
  }
  return String(value)
}

function deserializeValue(_key: string, raw: string): unknown {
  const looksLikeJson = raw.startsWith('[') || raw.startsWith('{')
  if (looksLikeJson) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  return raw
}

export function getAllSettings(): SettingsEntity {
  const db = getDatabase()
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{ key: string; value: string }>

  const stored: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      stored[row.key] = deserializeValue(row.key, row.value)
    } catch {
      stored[row.key] = row.value
    }
  }

  return {
    defaultYearRange: (stored['defaultYearRange'] as [number, number]) ?? DEFAULT_SETTINGS.defaultYearRange,
    defaultSortMetric: (stored['defaultSortMetric'] as SortMetric) ?? DEFAULT_SETTINGS.defaultSortMetric,
    refreshStrategy: (stored['refreshStrategy'] as RefreshStrategy) ?? DEFAULT_SETTINGS.refreshStrategy,
    refreshIntervalMinutes: stored['refreshIntervalMinutes'] !== undefined
      ? Number(stored['refreshIntervalMinutes'])
      : DEFAULT_SETTINGS.refreshIntervalMinutes,
    backtestInitialCapital: stored['backtestInitialCapital'] !== undefined
      ? Number(stored['backtestInitialCapital'])
      : DEFAULT_SETTINGS.backtestInitialCapital,
    backtestIncludeFees: stored['backtestIncludeFees'] !== undefined
      ? stored['backtestIncludeFees'] === 'true' || stored['backtestIncludeFees'] === true
      : DEFAULT_SETTINGS.backtestIncludeFees,
    backtestFeeRate: stored['backtestFeeRate'] !== undefined
      ? Number(stored['backtestFeeRate'])
      : DEFAULT_SETTINGS.backtestFeeRate,
    backtestStampDutyRate: stored['backtestStampDutyRate'] !== undefined
      ? Number(stored['backtestStampDutyRate'])
      : DEFAULT_SETTINGS.backtestStampDutyRate,
    backtestMinCommission: stored['backtestMinCommission'] !== undefined
      ? Number(stored['backtestMinCommission'])
      : DEFAULT_SETTINGS.backtestMinCommission
  }
}

export function updateSetting(key: string, value: unknown): void {
  const db = getDatabase()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, serializeValue(value), now)
}

export function updateSettingsBatch(partial: Record<string, unknown>): SettingsEntity {
  for (const [key, value] of Object.entries(partial)) {
    updateSetting(key, value)
  }
  return getAllSettings()
}

export function resetAllSettings(): SettingsEntity {
  const db = getDatabase()
  try {
    db.exec('BEGIN')
    db.prepare('DELETE FROM app_settings').run()
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      updateSetting(key, value)
    }
    db.exec('COMMIT')
  } catch {
    db.exec('ROLLBACK')
    throw new Error('Failed to reset settings')
  }
  return getAllSettings()
}
