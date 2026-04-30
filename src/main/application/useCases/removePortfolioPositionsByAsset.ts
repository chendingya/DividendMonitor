import type { AssetQueryDto } from '@shared/contracts/api'
import { getPortfolioRepository } from '@main/repositories/repositoryFactory'

export async function removePortfolioPositionsByAsset(request: AssetQueryDto): Promise<void> {
  const repository = getPortfolioRepository()
  await repository.removeByAsset(request)
}
