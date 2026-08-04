import { HousingService } from '@main/application/services/housingService'

const service = new HousingService()

export async function getHousingCityDetail(city: string) {
  return service.getCityDetail(city)
}
