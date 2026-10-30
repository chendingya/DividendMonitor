import { housingService } from '@main/application/services/housingService'
import type { UserHousingDataUpsertDto } from '@shared/contracts/api'

export async function updateHousingUserData(request: UserHousingDataUpsertDto): Promise<void> {
  await housingService.updateUserData(request)
}
