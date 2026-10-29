import type { WatchlistAddRequestDto } from '@shared/contracts/api'
import { resolveAssetQuery } from '@shared/contracts/api'
import { AssetRepository } from '@main/repositories/assetRepository'
import { getWatchlistRepository } from '@main/repositories/repositoryFactory'

export async function addWatchlistAsset(request: WatchlistAddRequestDto): Promise<void> {
  const identifier = resolveAssetQuery(request)
  const watchlistRepository = getWatchlistRepository()
  let name = request.name?.trim()
  if (!name) {
    const detail = await new AssetRepository().getDetail(request)
    name = detail.kind === 'STOCK' ? detail.stock.name : detail.name
  }

  await watchlistRepository.addAsset({
    assetType: identifier.assetType,
    market: identifier.market,
    code: identifier.code,
    name
  })
}
