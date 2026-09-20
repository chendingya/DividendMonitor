import type { SettingsEntity } from '@main/domain/entities/Settings'
import { getAllSettings } from '@main/repositories/settingsRepository'

export async function getSettings(): Promise<SettingsEntity> {
  return getAllSettings()
}
