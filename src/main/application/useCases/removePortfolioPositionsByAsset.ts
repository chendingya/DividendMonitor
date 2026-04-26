import type { AssetQueryDto } from '@shared/contracts/api'
import { PortfolioRepository } from '@main/repositories/portfolioRepository'

export async function removePortfolioPositionsByAsset(request: AssetQueryDto): Promise<void> {
  const repository = new PortfolioRepository()
  await repository.removeByAsset(request)
}
