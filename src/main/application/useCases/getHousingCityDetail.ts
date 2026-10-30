import { housingService } from '@main/application/services/housingService'

export async function getHousingCityDetail(city: string) {
  return housingService.getCityDetail(city)
}
