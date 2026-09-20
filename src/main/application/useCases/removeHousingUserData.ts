import { HousingService } from '@main/application/services/housingService'

const service = new HousingService()

export async function removeHousingUserData(city: string): Promise<void> {
  await service.removeUserData(city)
}
