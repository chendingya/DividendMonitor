import { getPortfolioRepository } from '@main/repositories/repositoryFactory'

export async function removePortfolioPosition(id: string): Promise<void> {
  const repository = getPortfolioRepository()
  await repository.remove(id)
}
