import type { PortfolioPositionDto } from '@shared/contracts/api'
import { getPortfolioRepository } from '@main/repositories/repositoryFactory'
import { applyCorporateActionsToPositions } from '@main/application/useCases/applyCorporateActionsToPositions'

export async function listPortfolioPositions(): Promise<PortfolioPositionDto[]> {
  // 打开持仓时自动应用已发生的除权除息（成本价扣减、送转股数增加），再返回最新持仓。
  try {
    await applyCorporateActionsToPositions()
  } catch (err) {
    console.warn('[Portfolio] 自动除权除息失败:', (err as Error).message)
  }

  const repository = getPortfolioRepository()
  return repository.list()
}
