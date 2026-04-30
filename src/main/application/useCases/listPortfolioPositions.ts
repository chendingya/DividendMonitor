import type { PortfolioPositionDto } from '@shared/contracts/api'
import { getPortfolioRepository } from '@main/repositories/repositoryFactory'

export async function listPortfolioPositions(): Promise<PortfolioPositionDto[]> {
  const repository = getPortfolioRepository()
  return repository.list()
}
