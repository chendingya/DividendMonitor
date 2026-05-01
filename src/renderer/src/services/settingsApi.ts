import { getSettingsDesktopApi } from '@renderer/services/desktopApi'
import type { SettingsDto } from '@shared/contracts/api'

export async function fetchSettings(): Promise<SettingsDto> {
  const api = getSettingsDesktopApi()
  return api.get()
}

export async function updateSettings(partial: Record<string, unknown>): Promise<SettingsDto> {
  const api = getSettingsDesktopApi()
  return api.update(partial)
}

export async function resetSettings(): Promise<SettingsDto> {
  const api = getSettingsDesktopApi()
  return api.reset()
}
