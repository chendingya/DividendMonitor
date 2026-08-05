import { HousingService } from '@main/application/services/housingService'

const service = new HousingService()

export function removeHousingUserData(city: string): void {
  service.removeUserData(city)
}
