import { ipcMain } from 'electron'
import { getSettings } from '@main/application/useCases/getSettingsUseCase'
import { updateSettings, resetSettings } from '@main/application/useCases/updateSettingsUseCase'

export function registerSettingsChannels() {
  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle('settings:update', (_event, payload: Record<string, unknown>) => {
    return updateSettings(payload)
  })

  ipcMain.handle('settings:reset', () => resetSettings())
}
