import { AssetRepository } from '@main/repositories/assetRepository'
import { getWatchlistRepository, getPortfolioRepository } from '@main/repositories/repositoryFactory'

/**
 * 启动后批量同步所有自选与持仓标的的分红方案（落库），供价格复权与自动除权除息使用。
 * 依赖 AssetRepository 的本地快照缓存：已缓存的标的不会重复发起网络请求，仅补全落库。
 */
export async function syncAllDividendEvents(): Promise<void> {
  const assetRepository = new AssetRepository()
  const assetKeys = new Set<string>()

  try {
    const watchlist = await getWatchlistRepository().listAssets()
    for (const asset of watchlist) {
      assetKeys.add(asset.assetKey)
    }
  } catch (err) {
    console.warn('[DividendSync] 读取自选失败:', (err as Error).message)
  }

  try {
    const positions = await getPortfolioRepository().list()
    for (const position of positions) {
      assetKeys.add(position.assetKey)
    }
  } catch (err) {
    console.warn('[DividendSync] 读取持仓失败:', (err as Error).message)
  }

  for (const assetKey of assetKeys) {
    try {
      await assetRepository.getDetail({ assetKey })
    } catch (err) {
      console.warn(`[DividendSync] 同步 ${assetKey} 分红失败:`, (err as Error).message)
    }
  }
}
