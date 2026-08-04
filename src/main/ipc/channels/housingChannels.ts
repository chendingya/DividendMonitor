import { ipcMain } from 'electron'
import type { MortgageRequestDto, UserHousingDataUpsertDto } from '@shared/contracts/api'
import { listHousingCities } from '@main/application/useCases/listHousingCities'
import { getHousingCityDetail } from '@main/application/useCases/getHousingCityDetail'
import { watchHousingCity, unwatchHousingCity } from '@main/application/useCases/toggleHousingWatchlist'
import { updateHousingUserData } from '@main/application/useCases/updateHousingUserData'
import { calculateMortgageUseCase } from '@main/application/useCases/calculateMortgage'

export function registerHousingChannels() {
  ipcMain.handle('housing:list-cities', async () => {
    return listHousingCities()
  })

  ipcMain.handle('housing:get-city-detail', async (_event, city: string) => {
    return getHousingCityDetail(city)
  })

  ipcMain.handle('housing:watch-city', async (_event, city: string) => {
    watchHousingCity(city)
  })

  ipcMain.handle('housing:unwatch-city', async (_event, city: string) => {
    unwatchHousingCity(city)
  })

  ipcMain.handle('housing:update-user-data', async (_event, request: UserHousingDataUpsertDto) => {
    updateHousingUserData(request)
  })

  ipcMain.handle('housing:calculate-mortgage', async (_event, request: MortgageRequestDto) => {
    return calculateMortgageUseCase(request)
  })
}
