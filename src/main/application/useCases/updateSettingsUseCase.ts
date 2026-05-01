import type { SettingsEntity } from '@main/domain/entities/Settings'
import { updateSettingsBatch, resetAllSettings } from '@main/repositories/settingsRepository'

export function updateSettings(partial: Record<string, unknown>): SettingsEntity {
  return updateSettingsBatch(partial)
}

export function resetSettings(): SettingsEntity {
  return resetAllSettings()
}
