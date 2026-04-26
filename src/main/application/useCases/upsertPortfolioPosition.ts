import type { PortfolioPositionUpsertDto } from '@shared/contracts/api'
import { PortfolioRepository } from '@main/repositories/portfolioRepository'

export async function upsertPortfolioPosition(request: PortfolioPositionUpsertDto): Promise<void> {
  const repository = new PortfolioRepository()
  await repository.upsert(request)
}
