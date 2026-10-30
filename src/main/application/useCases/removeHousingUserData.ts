import { housingService } from '@main/application/services/housingService'

export async function removeHousingUserData(city: string): Promise<void> {
  await housingService.removeUserData(city)
}
