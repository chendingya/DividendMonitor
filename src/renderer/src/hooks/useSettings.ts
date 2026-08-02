import { useState } from 'react'
import type { SettingsDto } from '@shared/contracts/api'
import { fetchSettings, updateSettings, resetSettings } from '@renderer/services/settingsApi'
import { useFetch } from '@renderer/hooks/useFetch'

export function useSettings() {
  const { data: settings, loading, error, reload, setData } = useFetch<SettingsDto | null>(
    async () => {
      const value = await fetchSettings()
      return value ?? null
    },
    [],
    { rethrow: false }
  )
  const [saving, setSaving] = useState(false)

  const save = async (partial: Record<string, unknown>) => {
    setSaving(true)
    try {
      const updated = await updateSettings(partial)
      setData(updated)
      return updated
    } catch (err) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    setSaving(true)
    try {
      const resetValue = await resetSettings()
      setData(resetValue)
      return resetValue
    } catch (err) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  return { settings, loading, error, saving, save, reset, reload }
}
