import type { AssetSearchItemDto, AssetSearchRequestDto } from '@shared/contracts/api'
import { toAssetSearchItemDto } from '@main/application/mappers/stockDtoMappers'
import { AssetRepository } from '@main/repositories/assetRepository'

export async function searchAssets(request: AssetSearchRequestDto): Promise<AssetSearchItemDto[]> {
  const repository = new AssetRepository()
  const assets = await repository.search(request)
  return assets.map(toAssetSearchItemDto)
}
