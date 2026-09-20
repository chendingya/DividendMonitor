import type { SettingsEntity } from '@main/domain/entities/Settings'
import { updateSettingsBatch, resetAllSettings } from '@main/repositories/settingsRepository'

export async function updateSettings(partial: Record<string, unknown>): Promise<SettingsEntity> {
  return updateSettingsBatch(partial)
}

export async function resetSettings(): Promise<SettingsEntity> {
  return resetAllSettings()
}
