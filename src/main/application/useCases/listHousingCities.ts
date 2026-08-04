import { HousingService } from '@main/application/services/housingService'

const service = new HousingService()

export async function listHousingCities() {
  return service.listCities()
}
