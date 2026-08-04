import { HousingService } from '@main/application/services/housingService'
import type { UserHousingDataUpsertDto } from '@shared/contracts/api'

const service = new HousingService()

export function updateHousingUserData(request: UserHousingDataUpsertDto): void {
  service.updateUserData(request)
}
