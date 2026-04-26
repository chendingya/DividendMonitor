import type { PortfolioPositionDto } from '@shared/contracts/api'
import { PortfolioRepository } from '@main/repositories/portfolioRepository'

export async function listPortfolioPositions(): Promise<PortfolioPositionDto[]> {
  const repository = new PortfolioRepository()
  return repository.list()
}
