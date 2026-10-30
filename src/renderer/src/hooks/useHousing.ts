import { useCallback, useState } from 'react'
import { useFetch } from '@renderer/hooks/useFetch'
import { housingApi } from '@renderer/services/housingApi'
import type { HousingCityDetailDto, HousingCitySummaryDto, UserHousingDataUpsertDto } from '@shared/contracts/api'

async function refreshAfterWrite(refresh?: () => void | Promise<void>): Promise<{ refreshError?: string }> {
  try {
    await refresh?.()
    return {}
  } catch (error) {
    return { refreshError: error instanceof Error ? error.message : '刷新失败' }
  }
}

export function useHousingCities() {
  const { data, loading, error, reload } = useFetch<HousingCitySummaryDto[]>(
    () => housingApi.listCities(),
    []
  )

  const [mutatingCity, setMutatingCity] = useState<string | null>(null)

  const toggleWatch = useCallback(async (city: string, watch: boolean) => {
    setMutatingCity(city)
    try {
      if (watch) {
        await housingApi.watchCity(city)
      } else {
        await housingApi.unwatchCity(city)
      }
    } finally {
      setMutatingCity(null)
    }
  }, [])

  return { data, loading, error, reload, toggleWatch, mutatingCity }
}

export function useHousingCityDetail(city: string) {
  return useFetch<HousingCityDetailDto>(
    () => housingApi.getCityDetail(city),
    [city]
  )
}

export function useHousingUserData(onSaved?: () => void | Promise<void>) {
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(async (request: UserHousingDataUpsertDto) => {
    setSaving(true)
    setError(null)
    try {
      await housingApi.updateUserData(request)
      return await refreshAfterWrite(onSaved)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败')
      throw saveError
    } finally {
      setSaving(false)
    }
  }, [onSaved])

  const remove = useCallback(async (city: string) => {
    setRemoving(true)
    setError(null)
    try {
      await housingApi.removeUserData(city)
      return await refreshAfterWrite(onSaved)
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '清除失败')
      throw removeError
    } finally {
      setRemoving(false)
    }
  }, [onSaved])

  return { save, remove, saving, removing, error }
}
