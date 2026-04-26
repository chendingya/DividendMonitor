import type { PortfolioPositionReplaceByAssetDto } from '@shared/contracts/api'
import { PortfolioRepository } from '@main/repositories/portfolioRepository'

export async function replacePortfolioPositionsByAsset(request: PortfolioPositionReplaceByAssetDto): Promise<void> {
  const repository = new PortfolioRepository()
  await repository.replaceByAsset(request)
}
