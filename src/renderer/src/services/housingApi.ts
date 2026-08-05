import type {
  HousingCityDetailDto,
  HousingCitySummaryDto,
  MortgageRequestDto,
  MortgageResultDto,
  UserHousingDataUpsertDto
} from '@shared/contracts/api'
import { getHousingDesktopApi } from '@renderer/services/desktopApi'

const api = () => getHousingDesktopApi()

export const housingApi = {
  listCities(): Promise<HousingCitySummaryDto[]> {
    return api().listCities()
  },
  getCityDetail(city: string): Promise<HousingCityDetailDto> {
    return api().getCityDetail(city)
  },
  watchCity(city: string): Promise<void> {
    return api().watchCity(city)
  },
  unwatchCity(city: string): Promise<void> {
    return api().unwatchCity(city)
  },
  updateUserData(request: UserHousingDataUpsertDto): Promise<void> {
    return api().updateUserData(request)
  },
  removeUserData(city: string): Promise<void> {
    return api().removeUserData(city)
  },
  calculateMortgage(request: MortgageRequestDto): Promise<MortgageResultDto> {
    return api().calculateMortgage(request)
  }
}
