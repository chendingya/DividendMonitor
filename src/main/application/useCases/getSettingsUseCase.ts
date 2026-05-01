import type { SettingsEntity } from '@main/domain/entities/Settings'
import { getAllSettings } from '@main/repositories/settingsRepository'

export function getSettings(): SettingsEntity {
  return getAllSettings()
}
