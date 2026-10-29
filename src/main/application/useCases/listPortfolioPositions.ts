import type { PortfolioPositionDto } from '@shared/contracts/api'
import { getPortfolioRepository } from '@main/repositories/repositoryFactory'
import { applyCorporateActionsToPositions } from '@main/application/useCases/applyCorporateActionsToPositions'

export async function listPortfolioPositions(): Promise<PortfolioPositionDto[]> {
  // 先应用已缓存的除权除息再返回持仓；行情补全后再次读取即可应用新分红。
  // 列表读取不能等待外网详情，否则空缓存/慢网络会隐藏已经保存的持仓。
  try {
    await applyCorporateActionsToPositions({ fetchMissing: false })
  } catch (err) {
    console.warn('[Portfolio] 自动除权除息失败:', (err as Error).message)
  }

  const repository = getPortfolioRepository()
  return repository.list()
}
