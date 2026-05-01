import { useState, useEffect, useCallback } from 'react'
import type { SettingsDto } from '@shared/contracts/api'
import { fetchSettings, updateSettings, resetSettings } from '@renderer/services/settingsApi'

export function useSettings() {
  const [settings, setSettings] = useState<SettingsDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchSettings()
      .then(setSettings)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(async (partial: Record<string, unknown>) => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateSettings(partial)
      setSettings(updated)
      return updated
    } catch (err) {
      setError((err as Error).message)
      throw err
    } finally {
      setSaving(false)
    }
  }, [])

  const reset = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const reset_ = await resetSettings()
      setSettings(reset_)
      return reset_
    } catch (err) {
      setError((err as Error).message)
      throw err
    } finally {
      setSaving(false)
    }
  }, [])

  return { settings, loading, error, saving, save, reset, reload: load }
}
