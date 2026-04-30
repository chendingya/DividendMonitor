import type { PortfolioPositionUpsertDto } from '@shared/contracts/api'
import { getPortfolioRepository } from '@main/repositories/repositoryFactory'

export async function upsertPortfolioPosition(request: PortfolioPositionUpsertDto): Promise<void> {
  const repository = getPortfolioRepository()
  await repository.upsert(request)
}
