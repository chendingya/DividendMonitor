import { useCallback, useState } from 'react'
import { useFetch } from '@renderer/hooks/useFetch'
import { housingApi } from '@renderer/services/housingApi'
import type { HousingCityDetailDto, HousingCitySummaryDto, UserHousingDataUpsertDto } from '@shared/contracts/api'

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

export function useHousingUserData(onSaved?: () => void) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(async (request: UserHousingDataUpsertDto) => {
    setSaving(true)
    setError(null)
    try {
      await housingApi.updateUserData(request)
      onSaved?.()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }, [onSaved])

  return { save, saving, error }
}
