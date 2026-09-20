import { HousingService } from '@main/application/services/housingService'

const service = new HousingService()

export async function watchHousingCity(city: string): Promise<void> {
  await service.watchCity(city)
}

export async function unwatchHousingCity(city: string): Promise<void> {
  await service.unwatchCity(city)
}
