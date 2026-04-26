import type { WatchlistAddRequestDto } from '@shared/contracts/api'
import { resolveAssetQuery } from '@shared/contracts/api'
import { AssetRepository } from '@main/repositories/assetRepository'
import { WatchlistRepository } from '@main/repositories/watchlistRepository'

export async function addWatchlistAsset(request: WatchlistAddRequestDto): Promise<void> {
  const identifier = resolveAssetQuery(request)
  const repository = new AssetRepository()
  const watchlistRepository = new WatchlistRepository()
  const detail = await repository.getDetail(request)

  await watchlistRepository.addAsset({
    assetType: identifier.assetType,
    market: identifier.market,
    code: identifier.code,
    name: request.name?.trim() || (detail.kind === 'STOCK' ? detail.stock.name : detail.name)
  })
}
