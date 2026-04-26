import { PortfolioRepository } from '@main/repositories/portfolioRepository'

export async function removePortfolioPosition(id: string): Promise<void> {
  const repository = new PortfolioRepository()
  await repository.remove(id)
}
