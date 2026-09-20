import { HousingService } from '@main/application/services/housingService'
import type { UserHousingDataUpsertDto } from '@shared/contracts/api'

const service = new HousingService()

export async function updateHousingUserData(request: UserHousingDataUpsertDto): Promise<void> {
  await service.updateUserData(request)
}
