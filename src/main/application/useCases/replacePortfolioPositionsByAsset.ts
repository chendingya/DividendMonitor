import type { PortfolioPositionReplaceByAssetDto } from '@shared/contracts/api'
import { getPortfolioRepository } from '@main/repositories/repositoryFactory'

export async function replacePortfolioPositionsByAsset(request: PortfolioPositionReplaceByAssetDto): Promise<void> {
  const repository = getPortfolioRepository()
  await repository.replaceByAsset(request)
}
