import { HousingService } from '@main/application/services/housingService'

const service = new HousingService()

export function watchHousingCity(city: string): void {
  service.watchCity(city)
}

export function unwatchHousingCity(city: string): void {
  service.unwatchCity(city)
}
